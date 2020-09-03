/*
  This script will take a collection in JSONL format of source records and make PUT requests based on the matchedId
*/

const fs = require('fs');
const superagent = require('superagent');
const { getAuthToken } = require('./lib/login');
const readline = require('readline');
let inFile = process.argv[2];

(async () => {
  try {
    let inData;
    if (!inFile) {
      throw new Error('Usage: node updateSourceRecords.js <source_record_collection.jsonl>');
    } else if (!fs.existsSync(inFile)) {
      throw new Error('Can\'t find input file');
    }

    const config = (fs.existsSync('./config.js')) ? require('./config.js') : require('./config.default.js');

    const authToken = await getAuthToken(superagent, config.okapi, config.tenant, config.authpath, config.username, config.password);

    const fileStream = fs.createReadStream(inFile);

    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });

    let x = 0;
    
    for await (const line of rl) {
      x++;
      let rec = JSON.parse(line);
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
