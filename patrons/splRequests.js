/*
  This script will take a request file from a Horizon system and convert them into FOLIO request objects.
*/

const fs = require('fs');
const uuid = require('uuid/v3');
const path = require('path');
const superagent = require('superagent');
const { getAuthToken } = require('../lib/login');
let inFile = process.argv[3];
let locFile = process.argv[2];

const wait = (ms) => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

const getDateByDays = (days) => {
  const ms = days * 86400 * 1000;
  const rdate = new Date(ms).toISOString().replace(/\.000Z/, '-0700');
  return rdate;
}
const getTimeByMinutes = (min) => {
  const h = min/60;
  const hour = Math.floor(h).toString().padStart(2, 0);
  const m = Math.floor((h - hour) * 60).toString().padStart(2, 0);
  return `${hour}:${m}:00`
}

const reqStatus = [
  'Open - Not yet filled',
  'Open - Awaiting pickup',
  'Open - In transit',
  'Closed - Pickup expired',
  'N/A',
  'N/A',
  'Closed - Cancelled'
];

(async () => {
  try {
    let inRequests;
    if (!inFile) {
      throw new Error('Usage: node splRequests.js <locations file> <hz requests file>');
    } else if (!fs.existsSync(inFile)) {
      throw new Error('Can\'t find input file');
    } else if (!fs.existsSync(locFile)) {
      throw new Error('Can\'t find locations file');
    } else {
      inRequests = require(inFile)
    }
    const config = (fs.existsSync('../config.js')) ? require('../config.js') : require('../config.default.js');

    const locMap = {};
    const locJson = require(locFile);
    locJson.locations.forEach(l => {
      locMap[l.code] = l.primaryServicePoint;
    });

    const dir = path.dirname(inFile);

    const authToken = await getAuthToken(superagent, config.okapi, config.tenant, config.authpath, config.username, config.password);
    
    // gather all requests by bib#
    const bibs = {};
    inRequests.forEach(r => {
      let id = r['bib#'];
      if (!bibs[id]) {
        bibs[id] = [];
      }
      bibs[id].push(r);
    });

    inRequests = {};

    const out = { requests: [] };
    const userMap = {};

    let ttl = 0;
    for (b in bibs) {
      let items = [];
      let icount = 0;
      let inData = bibs[b];
      let iurl = `${config.okapi}/item-storage/items?query=instance.hrid==${b}&limit=500`;
      ttl++;
      try {
        console.log(`[${ttl}] GET ${iurl}`);
        res = await superagent
          .get(iurl)
          .set('x-okapi-token', authToken)
          .set('accept', 'application/json');
        items = res.body.items;
        icount = res.body.totalRecords;
      } catch (e) {
        console.log(e.response || e.message);
      }
      if (icount > 0) {
        const rcount = {};
        const rstatus = {};
        for (let x = 0; x < inData.length ; x++) {
          if (inData[x].request_status < 3) {
            let id = uuid(inData[x]['request#'].toString(), 'dfc59d30-cdad-3d03-9dee-d99117852eab');
            let bibNum = inData[x]['bib#'];
            let itemNum = inData[x]['item#'];
            let userNum = inData[x]['borrower#'];
            let pickupLoc = locMap[inData[x].pickup_location];
            let reqLoc = locMap[inData[x].request_location];
            let pos = inData[x].bib_queue_ord;
            let rdate = getDateByDays(inData[x].request_date);
            let rtime = getTimeByMinutes(inData[x].request_time);
            let rtimestamp = rdate.replace(/00:00:00/, rtime);
            let expiry = inData[x].hold_exp_date ? getDateByDays(inData[x].hold_exp_date) : '';
            let reqObj = {
              id: id,
              requestDate: rtimestamp,
              fulfilmentPreference: 'Hold Shelf',
              pickupServicePointId: pickupLoc,
              position: pos,
              requestExpirationDate: expiry,
              status: reqStatus[inData[x].request_status]
            };
            
            let uurl = `${config.okapi}/users?query=externalSystemId==${userNum}`;
            let itemId;
            let userId;

            // get item level holds first
            if (itemNum) {
              console.log(` Creating item level hold ${itemNum}`);
              let item = await items.find(i => i.hrid === itemNum.toString());
              if (item) {
                if (item.status.name === 'Available') {
                  reqObj.requestType = 'Page';
                  item.status.name = 'Paged';
                } else {
                  reqObj.requestType = 'Hold';
                }
                itemId = item.id;
              } else {
                console.log(`    WARN Item with hrid ${itemNum} not found!`);
              }
            } else {
              // if the item has an available status, then let's use it
              let avItem = await items.find(i => i.status.name === 'Available');
              if (avItem) {
                console.log(`  INFO Found an Available item (${avItem.hrid})`);
                reqObj.requestType = 'Page';
                avItem.status.name = 'Paged';
                itemId = avItem.id;
                avItem.rcount = 1;
              } else {
                reqObj.requestType = 'Hold';
                let last = false;

                // there are no available items, so lets find an item with the fewest requests (rcount)
                for (let x = 0; x < items.length; x++) {
                  let status = items[x].status.name;
                  if (!items[x].rcount) {
                    items[x].rcount = 0;
                  }
                  // we can't place holds on lost or withdrawn items, so let's skip these items
                  if (status.match(/Missing|Declared lost|Withdrawn/)) {
                    itemId = null;
                  } else if (items[x].rcount === 0) {  // 0 requests, let's use it
                    itemId = items[x].id;
                    items[x].rcount++;
                    last = true;
                  }
                  if (last) break;
                }
              }
            }
            reqObj.itemId = itemId;

            if (itemId) {
              // get requesterId
              if (userMap[userNum]) {
                console.log(`  INFO User # ${userNum} found in cache.`)
                reqObj.requesterId = userMap[userNum];
              } else {
                console.log(`  GET ${uurl}`);
                try {
                  let res = await superagent
                    .get(uurl)
                    .set('x-okapi-token', authToken)
                    .set('accept', 'application/json');
                  if (res.body.totalRecords === 1) {
                    userId = res.body.users[0].id;
                    reqObj.requesterId = userId;
                    userMap[userNum] = userId;
                  }
                  else {
                    console.log(`    WARN No user record found for ${userNum}!`);
                  }
                } catch (e) {
                  // console.log(e.message)
                  console.log(e);
                }
              }
            }
            if (userId && itemId) out.requests.push(reqObj);
            await wait(config.delay);
          }
        }
      } else {
        throw new Error( `ERROR No items found for Bib# ${b}!`)
      }
    }
    out.totalRecords = out.requests.length;
    const outFile = `${dir}/requests.json`;
    console.log(`Writing to ${outFile}`);
    fs.writeFileSync(outFile, JSON.stringify(out, null, 2));
  } catch (e) {
    // console.log(e.message);
    console.log(e);
  }
})();
