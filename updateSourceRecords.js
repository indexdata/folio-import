/*
  This script will take a collection or source records and make PUT requests base on the matchedId
*/

const fs = require('fs');
const superagent = require('superagent');
const { getAuthToken } = require('./lib/login');
let inFile = process.argv[2];

(async () => {
  try {
    let inData;
    if (!inFile) {
      throw new Error('Usage: node changeSourceRecods.js <source_record_collection>');
    } else if (!fs.existsSync(inFile)) {
      throw new Error('Can\'t find input file');
    } else {
      inData = require(inFile);
    }
    const config = (fs.existsSync('./config.js')) ? require('./config.js') : require('./config.default.js');

    const authToken = await getAuthToken(superagent, config.okapi, config.tenant, config.authpath, config.username, config.password);
    
    for (let x = 0; x < inData.records.length; x++) {
      let rec = inData.records[x];
      let url = `${config.okapi}/source-storage/records/${rec.matchedId}`;
      console.log(`# ${x} PUT to ${url}`);
      try {
        let res = await superagent
          .put(url)
          .send(rec)
          .set('x-okapi-token', authToken)
          .set('content-type', 'application/json')
          .set('accept', 'application/json');
      } catch (e) {
        console.log(e.response || e);
      } 
    } 
  } catch (e) {
    console.log(e.message);
  }
})();
