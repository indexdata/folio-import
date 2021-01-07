/*
  This script will take a request file from a Horizon system and convert them into FOLIO request objects.
*/

const fs = require('fs');
const uuid = require('uuid/v3');
const path = require('path');
const superagent = require('superagent');
const { getAuthToken } = require('../lib/login');
let inFile = process.argv[2];

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
      throw new Error('Usage: node splRequests.js <hz requests file>');
    } else if (!fs.existsSync(inFile)) {
      throw new Error('Can\'t find input file');
    } else {
      inRequests = require(inFile)
    }
    const config = (fs.existsSync('../config.js')) ? require('../config.js') : require('../config.default.js');

    const dir = path.dirname(inFile);

    const authToken = await getAuthToken(superagent, config.okapi, config.tenant, config.authpath, config.username, config.password);
    
    // gather all requests by bib#

    console.log(`INFO Gathering requests and grouping by bib#...`);
    const bibs = {};
    let bibttl = 0;
    inRequests.forEach(r => {
      let id = r['bib#'];
      if (!bibs[id]) {
        bibs[id] = [];
        bibttl++;
      }
      bibs[id].push(r);
    });
    console.log(`INFO ${bibttl} bibs found...`);

    console.log(`INFO Getting locations...`);
    const locMap = {};
    let locttl = 0;
    try {
      res = await superagent
        .get(`${config.okapi}/locations?limit=100`)
        .set('x-okapi-token', authToken)
        .set('accept', 'application/json');
      locJson = res.body;
      await locJson.locations.forEach(l => {
        locMap[l.code] = l.primaryServicePoint;
        locttl++;
      });
    } catch (e) {
      throw new Error(e);
    }
    console.log(`INFO ${locttl} locations mapped...`);

    inRequests = {};

    const out = { requests: [] };
    const userMap = {};

    let ttl = 0;
    for (b in bibs) {
      let items = [];
      let allItems = [];
      let icount = 0;
      let inData = bibs[b];
      let iurl = `${config.okapi}/item-storage/items?query=instance.hrid==${b}&limit=500`;
      ttl++;
      console.log(`INFO Getting items for bib# ${b}...`);
      try {
        res = await superagent
          .get(iurl)
          .set('x-okapi-token', authToken)
          .set('accept', 'application/json');
        allItems = res.body.items;
        icount = res.body.totalRecords;
      } catch (e) {
        console.log(e.response || e.message);
      }
      for (let i = 0; i < allItems.length; i++) {
        let status = allItems[i].status.name;
        if (!status.match(/Missing|Declared lost|Withdrawn/)) {
          allItems[i].rcount = 0;
          items.push(allItems[i]);
        } else {
          console.log(`WARN item ${allItems[i].hrid} has a status of ${status}-- not using`);
        }
      }

      let iround = 0;
      if (icount > 0) {
        for (let x = 0; x < inData.length ; x++) {
          let itemHrid = '';
          let reqNum = inData[x]['request#'];
          console.log(`[${reqNum}] INFO Processing request`);
          if (inData[x].request_status < 10) {
            let id = uuid(reqNum.toString(), 'dfc59d30-cdad-3d03-9dee-d99117852eab');
            let itemNum = inData[x]['item#'];
            let userNum = inData[x]['borrower#'];
            let pickupLoc = locMap[inData[x].pickup_location];
            let pos = inData[x].bib_queue_ord;
            let rdate = getDateByDays(inData[x].request_date);
            let rtime = getTimeByMinutes(inData[x].request_time);
            let rtimestamp = rdate.replace(/00:00:00/, rtime);
            let expiry = inData[x].hold_exp_date ? getDateByDays(inData[x].hold_exp_date) : (inData[x].expire_date) ? getDateByDays(inData[x].expire_date) : '';
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
              console.log(`[${reqNum}] INFO Creating item level hold on ${itemNum}`);
              let item = await items.find(i => i.hrid === itemNum.toString());
              if (item) {
                if (item.status.name === 'Available') {
                  reqObj.requestType = 'Page';
                  item.status.name = 'Paged';
                } else {
                  reqObj.requestType = 'Hold';
                }
                itemId = item.id;
                itemHrid = item.hrid;
                item.rcount++;
              } else {
                console.log(`[${reqNum}] WARN Item with hrid ${itemNum} not found!`);
              }
            } else {
              // if the item has an available status, then let's use it
              let avItem = await items.find(i => i.status.name === 'Available');
              if (avItem) {
                console.log(`[${reqNum}] INFO Found an Available item (${avItem.hrid})`);
                reqObj.requestType = 'Page';
                avItem.status.name = 'Paged';
                itemId = avItem.id;
                itemHrid = avItem.hrid;
                avItem.rcount++;
              } else {
                reqObj.requestType = 'Hold';
                // there are no available items, so lets find an item with the fewest requests (rcount)
                items.sort((a, b) => {
                  return a.rcount - b.rcount
                });
                itemId = items[0].id;
                items[0].rcount++;
                itemHrid = items[0].hrid;
              }
            }
            reqObj.itemId = itemId;

            if (itemId) {
              // get requesterId
              if (userMap[userNum]) {
                console.log(`[${reqNum}] INFO User # ${userNum} found in cache.`)
                userId = userMap[userNum];
                reqObj.requesterId = userId;
              } else {
                console.log(`[${reqNum}] INFO Looking up user with externalSystemId ${userNum}`);
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
                    console.log(`[${reqNum}] ERROR No user record found for ${userNum}!`);
                  }
                } catch (e) {
                  console.log(e);
                }
              }
            }
            if (userId && itemId) {
              out.requests.push(reqObj);
              console.log(`[${reqNum}] INFO Request successfully created on item ${itemHrid} for user ${userNum}`)
            } else {
              console.log(`[${reqNum}] ERROR Request creation failed!`);
            }
            await wait(config.delay);
          } else {
            console.log(`[${reqNum}] WARN Request has a cancelled status of "${inData[x].request_status}" -- skipping`);
          }
          console.log('---');
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
