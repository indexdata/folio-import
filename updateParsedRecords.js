/*
  This script will take a list of instance ids and update its corresponding parsedRecord.
  A js script is required to do the editing.  Here is an example of adding "PRTEST" to 
  the end of the 245$a:
  
  module.exports = (pr) => {
    for (let field of pr.fields) {
      let tag = Object.keys(field)[0];
      if (tag === '245') {
        for (let sub of field[tag].subfields) {
          let code = Object.keys(sub)[0];
          if (code === 'a') {
            sub[code] += ' PRTEST';
          }
        }
      }
    }
    return pr;
  };

*/

const fs = require('fs');
const superagent = require('superagent');
const { getAuthToken } = require('./lib/login');
const readline = require('readline');

let test = false;
process.argv.forEach((a,i) => {
  if (a === '-t') {
    test = true;
    process.argv.splice(i, 1);
  }
});
let inFile = process.argv[3];
let scriptFile = process.argv[2];

(async () => {
  try {
    if (!inFile) {
      throw new Error('Usage: node updateParsedRecords.js <script file> <file of intances ids>');
    } else if (!fs.existsSync(inFile)) {
      throw new Error('Can\'t find data file');
    } else if (!fs.existsSync(scriptFile)) {
      throw new Error('Can\'t find script file');
    }
    
    const editor = require(scriptFile);

    const config = (fs.existsSync('./config.js')) ? require('./config.js') : require('./config.default.js');

    const authToken = await getAuthToken(superagent, config.okapi, config.tenant, config.authpath, config.username, config.password);

    const fileStream = fs.createReadStream(inFile);

    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });

    let x = 0;
    for await (const id of rl) {
      x++;
      let url = `${config.okapi}/change-manager/parsedRecords?instanceId=${id}`;
      console.log(`# ${x} GET ${url}`);
      try {
        let res = await superagent
          .get(url)
          .set('x-okapi-token', authToken)
          .set('accept', 'application/json');
        let rec = res.body;
        let prUpdated = editor(rec.parsedRecord.content);
        if (test) { 
          console.log(JSON.stringify(prUpdated, null, 2));
        } else {
          rec.parsedRecord.content = prUpdated;
          try {
            let purl = `${config.okapi}/change-manager/parsedRecords/${rec.id}`;
            console.log(`  PUT to ${purl}`)
            let res = await superagent
              .put(purl)
              .send(rec)
              .set('x-okapi-token', authToken)
              .set('content-type', 'application/json')
              .set('accept', 'application/json');
          } catch (e) {
            console.log(e.response || e);
          }
        }
      } catch (e) {
        console.log(e.response || e);
      }
      if (test && x === 1) break;
      if (x === 1) break;

      /*

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
      */
    } 
  } catch (e) {
    console.log(e.message);
  }
})();
