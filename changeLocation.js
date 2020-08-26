/*
  This script will take a list of holdings ids or hrids and change location in holdings.
*/

const fs = require('fs');
const superagent = require('superagent');
const path = require('path');
const { getAuthToken } = require('./lib/login');
let inFile = process.argv[2];
let newId = process.argv[3];

(async () => {
  try {
    let inData;
    if (!newId) {
      throw new Error('Usage: node simmonsChangeLocations.js <hrid or uuid file> <new locationId> [<limit>]');
    } else if (!fs.existsSync(inFile)) {
      throw new Error('Can\'t find input file');
    } else {
      inData = fs.readFileSync(inFile, 'utf8');
    }
    const config = (fs.existsSync('./config.js')) ? require('./config.js') : require('./config.default.js');

    const lines = inData.split(/\n/);
    lines.pop();
    let limit = (process.argv[4]) ? parseInt(process.argv[4], 10) : lines.length;
    if (isNaN(limit)) {
      throw new Error('Limit must be a number.');
    }
    console.log(`Processing ${limit} lines...`);

    const authToken = await getAuthToken(superagent, config.okapi, config.tenant, config.authpath, config.username, config.password);

    try {
      const locUrl = `${config.okapi}/locations/${newId}`;
      let res = await superagent
        .get(locUrl)
        .set('x-okapi-token', authToken)
        .set('accept', 'application/json');
      console.info('\x1b[33m%s\x1b[0m', `Changing location to "${res.body.name}"`);
    } catch (e) {
      throw new Error(`Confirming location -- ${e}`);
    }

    for (let x = 0; x < limit; x++) {
      let qid = lines[x];
      let url;
      if (qid.match(/\w{8}-\w{4}-\w{4}-\w{4}-\w{12}/)) {
        url = `${config.okapi}/holdings-storage/holdings/${qid}` 
      } else {
        url = `${config.okapi}/holdings-storage/holdings?query=hrid==${qid}`;
      }
      console.log(`[${x}] Getting ${url}`);
      try {
        let res = await superagent
          .get(url)
          .set('x-okapi-token', authToken)
          .set('accept', 'application/json');
        let hr = (res.body.holdingsRecords) ? res.body.holdingsRecords[0] : res.body;
        if (hr) {
          hr.permanentLocationId = newId;
          let purl = `${config.okapi}/holdings-storage/holdings/${hr.id}`;
          console.log(`    PUT ${purl}`);
          try {
            let res = await superagent
              .put(url)
              .set('x-okapi-token', authToken)
              .set('content-type', 'application/json')
              .set('accept', 'text/plain')
              .send(hr);
          } catch (e) {
            console.log(e.response || e);
          }
        } 
      } catch (e) {
        console.log(e.response || e);
      }
    }
  } catch (e) {
    console.log(e.message);
  }
})();
