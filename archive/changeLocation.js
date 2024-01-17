/*
  This script will take a list of holdings ids or hrids and change location in holdings.
*/

const fs = require('fs');
const superagent = require('superagent');
const path = require('path');
const { getAuthToken } = require('./lib/login');
const argv = require('minimist')(process.argv.slice(2));

let inFile = argv._[1];
let newId = (argv._[0]) ? argv._[0].toString() : '';
let recType = (argv.t) ? argv.t : 'holdings'; 

(async () => {
  try {
    let inData;
    if (!inFile) {
      throw new Error('Usage: node simmonsChangeLocations.js [ -t idType (item|holdings), -l limit ] <permamentLocationId> <file of ids or hrids>');
    } else if (!fs.existsSync(inFile)) {
      throw new Error('Can\'t find input file');
    } else if (!newId.match(/^........-....-....-....-............$/)) {
      throw new Error(`${newId} is not a proper UUID`);
    } else {
      inData = fs.readFileSync(inFile, 'utf8');
    }
    const config = (fs.existsSync('./config.js')) ? require('./config.js') : require('./config.default.js');

    const lines = inData.split(/\n/);
    lines.pop();
    let limit = (argv.l) ? parseInt(argv.l, 10) : lines.length;
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
        if (recType === 'item') {
          url = `${config.okapi}/holdings-storage/holdings?query=item.id==${qid}`
        } else {
          url = `${config.okapi}/holdings-storage/holdings/${qid}`
        }
      } else {
        if (recType === 'item') {
          url = `${config.okapi}/holdings-storage/holdings?query=item.hrid==${qid}`
        } else {
          url = `${config.okapi}/holdings-storage/holdings?query=holdings.hrid=${qid}`
        }
      }

      console.log(`[${x}] Getting holdings ${url}`);
      
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
              .put(purl)
              .set('x-okapi-token', authToken)
              .set('content-type', 'application/json')
              .set('accept', 'text/plain')
              .send(hr);
          } catch (e) {
            console.log(e.response.message || e);
          }
        } else {
          console.log('  WARN Holdings record not found');
        } 
      } catch (e) {
        console.log(e.response.message || e);
      }
    }
  } catch (e) {
    console.log(e.message);
  }
})();
