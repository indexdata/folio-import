const fs = require('fs');
const superagent = require('superagent');
const readline = require('readline');
const path = require('path');
const { getAuthToken } = require('./lib/login');

let ep = process.argv[2];
let inFile = process.argv[3];

(async () => {
  try {
    const start = new Date().valueOf();
    if (!inFile) {
      throw 'Usage: node confirmLoad.js <endpoint> <jsonl_file> ';
    } else if (!fs.existsSync(inFile)) {
      throw new Error('Can\'t find input file');
    } 
    const config = (fs.existsSync('./config.js')) ? require('./config.js') : require('./config.default.js');

    ep = ep.replace(/__/g, '/');
    ep = ep.replace(/^\.x\//, '');
    const workingDir = path.dirname(inFile);
    const baseName = path.basename(inFile, '.jsonl');
    const notFoundPath = `${workingDir}/${baseName}-not-found.jsonl`;
    if (fs.existsSync(notFoundPath)) {
      fs.unlinkSync(notFoundPath);
    }
    
    const authToken = await getAuthToken(superagent, config.okapi, config.tenant, config.authpath, config.username, config.password);

    const actionUrl = `${config.okapi}/${ep}`;
    let updated = 0;
    let success = 0;
    let fail = 0;

    const fileStream = fs.createReadStream(inFile);

    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });

    let x = 0;
    for await (const line of rl) {
      x++;
      let rec = JSON.parse(line);
      let lDate = new Date();
      let recUrl = `${actionUrl}/${rec.id}`;
      console.log(`[${x}] ${lDate} ${recUrl}`);
      try {
        let res = await superagent
          .get(recUrl)
          .set('x-okapi-token', authToken)
          .set('accept', 'application/json');
        success++;
      } catch (e) {
        console.log(`WARN record not found for ${rec.id}...`);
        fs.writeFileSync(notFoundPath, line + '\n', { flag: 'a' });
        fail++;
      }
    }
    const end = new Date().valueOf();
    const ms = end - start;
    const time = Math.floor(ms / 1000);
    console.log(`\nTime:            ${time} sec`);
    console.log(`Records updated: ${updated}`);
    console.log(`Records added:   ${success}`);
    console.log(`Failures:        ${fail}\n`);
  } catch (e) {
    console.error(e);
  }
})();
