/*
  This script will take a list of instance ids or hrids and update its corresponding parsedRecord.
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

  You can view changes to the record by using the -t option.  This will display one updated record to the console and not 
  PUT the changes to change-manager.
*/

const fs = require('fs');
const superagent = require('superagent');
const { getAuthToken } = require('./lib/login');
const readline = require('readline');
const path = require('path');

let test = false;
process.argv.forEach((a,i) => {
  if (a === '-t') {
    test = true;
    process.argv.splice(i, 1);
  }
});

let scriptFile = process.argv[2];
let inFile = process.argv[3];

(async () => {
  try {
    if (!inFile) {
      throw new Error('Usage: node updateParsedRecords.js [-t test] <script file> <intanceIds or hrids>');
    } else if (!fs.existsSync(inFile)) {
      throw new Error('Can\'t find data file');
    } else if (!fs.existsSync(scriptFile)) {
      throw new Error('Can\'t find script file');
    }

    let dir = path.dirname(inFile);
    let bak = `${dir}/parsedRecordsBak.jsonl`;
    if (fs.existsSync(bak)) {
      fs.unlinkSync(bak);
    }
    
    scriptFile = scriptFile.replace(/^([^.])/, './$1');
    const editor = require(scriptFile);

    const config = (fs.existsSync('./config.js')) ? require('./config.js') : require('./config.default.js');

    const authToken = await getAuthToken(superagent, config.okapi, config.tenant, config.authpath, config.username, config.password);

    const fileStream = fs.createReadStream(inFile);

    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });

    let x = 0;
    for await (let id of rl) {
      x++;
      if (!id.match(/........-....-....-....-............/)) {
        let instUrl = `${config.okapi}/instance-storage/instances?query=hrid==${id}`;
        console.log(`WARN ${id} looks like an hrid, looking up instanceId...`);
        try {
          let res = await superagent
            .get(instUrl)
            .set('x-okapi-token', authToken)
            .set('accept', 'application/json');
          id = res.body.instances[0].id;
        } catch (e) {
          console.log(e.response || e);
        }
      }
      let url = `${config.okapi}/change-manager/parsedRecords?instanceId=${id}`;
      console.log(`# ${x} GET ${url}`);
      try {
        let res = await superagent
          .get(url)
          .set('x-okapi-token', authToken)
          .set('accept', 'application/json');
        let bakData = JSON.stringify(res.body);
        let rec = res.body;
        let prUpdated = editor(rec.parsedRecord.content);
        if (prUpdated) {
          prUpdated.fields.sort((a, b) => {
            aTag = Object.keys(a)[0];
            bTag = Object.keys(b)[0];
            if (aTag < bTag) return -1;
            else if (bTag > bTag) return 1;
            else return 0;
          });
          if (test) { 
            console.log(JSON.stringify(prUpdated, null, 2));
          } 
          else {
            rec.parsedRecord.content = prUpdated;
            fs.writeFileSync(bak, bakData + "\n", { flag: 'a' })
            try {
              let purl = `${config.okapi}/change-manager/parsedRecords/${rec.id}`;
              console.log(`    PUT to ${purl}`)
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
        } else {
          console.log('  No changes made...');
        }
      } catch (e) {
        console.log(e.response || e);
      } 
      if (test && x === 1) break;
    } 
  } catch (e) {
    console.log(e.message);
  }
})();
