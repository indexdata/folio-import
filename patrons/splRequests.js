/*
  This script will take a list of required resquests values and do the following:
  1. Lookup requester ID by externalSystemId (if not a UUID)
  2. Lookup item ID by hrid (if not a UUID)
*/

const fs = require('fs');
const uuid = require('uuid/v3');
const superagent = require('superagent');
const { getAuthToken } = require('../lib/login');
let inFile = process.argv[2];

const wait = (ms) => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

const getDateByDays = (days) => {
  const ms = days * 86400 * 1000;
  const rdate = new Date(ms).toISOString();
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
      throw new Error('Usage: node splRequests.js <hz requests file>');
    } else if (!fs.existsSync(inFile)) {
      throw new Error('Can\'t find input file');
    } else {
      inData = require(inFile)
    }
    const config = (fs.existsSync('../config.js')) ? require('../config.js') : require('../config.default.js');

    const authToken = await getAuthToken(superagent, config.okapi, config.tenant, config.authpath, config.username, config.password);
    
    for (let x = 0; x < inData.length ; x++) {
      let id = uuid(inData[x]['request#'].toString(), 'dfc59d30-cdad-3d03-9dee-d99117852eab');
      let bibNum = inData[x]['bib#'];
      let itemNum = inData[x]['item#'];
      let userNum = inData[x]['borrower#'];
      let pickupLoc = inData[x].pickup_location;
      let reqLoc = inData[x].request_location;
      let pos = inData[x].bib_queue_ord;
      let rdate = getDateByDays(inData[x].request_date);
      let rtime = getTimeByMinutes(inData[x].request_time);
      let rtimestamp = rdate.replace(/00:00:00/, rtime);

      console.log(inData[x]);

      /*
      try {
        let res = await superagent
          .get(url)
          .set('x-okapi-token', authToken)
          .set('accept', 'application/json');
        if (res.body.totalRecords == 1) {
          item = res.body.items[0];
          item.barcode = bc;
          console.log(`[${hrid}] Setting barcode to ${bc}`);
          try {
            let purl = `${config.okapi}/item-storage/items/${item.id}`;
            console.log(`  PUT to ${purl}`);
            await superagent
              .put(purl)
              .send(item)
              .set('x-okapi-token', authToken)
              .set('content-type', 'application/json')
              .set('accept', 'text/plain');
          } catch (e) {
            console.log(e.response.text || e);
          } 
        } else {
          throw new Error(`No item record found for hrid == ${hrid}`);
        }
      } catch (e) {
        console.log(e.response || e);
      } 
      */
      await wait(config.delay);
    } 
  } catch (e) {
    console.log(e.message);
  }
})();
