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

(async () => {
  try {
    let inData;
    if (!inFile) {
      throw new Error('Usage: node splRequests.js <locations file> <hz requests file>');
    } else if (!fs.existsSync(inFile)) {
      throw new Error('Can\'t find input file');
    } else if (!fs.existsSync(locFile)) {
      throw new Error('Can\'t find locations file');
    } else {
      inData = require(inFile)
    }
    const config = (fs.existsSync('../config.js')) ? require('../config.js') : require('../config.default.js');

    const locMap = {};
    const locJson = require(locFile);
    locJson.locations.forEach(l => {
      locMap[l.code] = l.primaryServicePoint;
    });

    const dir = path.dirname(inFile);

    const authToken = await getAuthToken(superagent, config.okapi, config.tenant, config.authpath, config.username, config.password);
    const out = { requests: [] };
    
    for (let x = 0; x < inData.length ; x++) {
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
        requestType: 'Hold',
        requestDate: rtimestamp,
        fulfilmentPreference: 'Hold Shelf',
        pickupServicePointId: pickupLoc,
        position: pos,
        requestExpirationDate: expiry
      };

      let iurl;
      if (itemNum) {
        iurl = `${config.okapi}/item-storage/items?query=hrid==${itemNum}`;
      } else {
        iurl = `${config.okapi}/item-storage/items?query=instance.hrid==${bibNum}`;
      }
      let uurl = `${config.okapi}/users?query=externalSystemId==${userNum}`;

      // get itemId
      let itemId;
      let userId
      try {
        console.log(`[${x}] GET ${iurl}`);
        let res = await superagent
          .get(iurl)
          .set('x-okapi-token', authToken)
          .set('accept', 'application/json');
        if (res.body.totalRecords > 0) {
          itemId = res.body.items[0].id;
          reqObj.itemId = itemId;
        } else {
          throw new Error(` ERROR No item record found found for instance: ${bibNum} item: ${itemNum}!`);
        }
        if (itemId) {
          // get requesterId
          try {
            let res = await superagent
              .get(uurl)
              .set('x-okapi-token', authToken)
              .set('accept', 'application/json');
            if (res.body.totalRecords > 0) {
              userId = res.body.users[0].id;
              reqObj.requesterId = userId;
            }
            else {
              throw new Error(` ERROR No user record found for ${userNum}!`);
            }
          } catch (e) {
            console.log(e.message)
          }
        }
      } catch (e) {
        console.log(e.response || e.message);
      } 
      if (userId && itemId) out.requests.push(reqObj);
      await wait(config.delay);
    } 
    out.totalRecords = out.requests.length;
    const outFile = `${dir}/requests.json`;
    console.log(`Writing to ${outFile}`);
    fs.writeFileSync(outFile, JSON.stringify(out, null, 2));
  } catch (e) {
    console.log(e.message);
  }
})();