const fs = require('fs');
const superagent = require('superagent');
const readline = require('readline');
const path = require('path');

const { getAuthToken } = require('./lib/login');
let inFile = process.argv[2];

(async () => {
  try {
    const start = new Date().valueOf();
    if (!inFile) {
      throw 'Usage: node makePreSuc.js <jsonl_file>';
    } else if (!fs.existsSync(inFile)) {
      throw new Error('Can\'t find input file');
    } 
    const config = (fs.existsSync('./config.js')) ? require('./config.js') : require('./config.default.js');

    const workingDir = path.dirname(inFile);
    const baseName = path.basename(inFile, '.jsonl');
    const outPath = `${workingDir}/${baseName}_done.jsonl`;
    if (fs.existsSync(outPath)) {
      fs.unlinkSync(outPath);
    }
    
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
      if (rec.succeedingInstanceId) {
        let ids = rec.identifiers || [];
        for (y = 0; y < ids.length; y++) {
          let linkId = '';
          let idType = ids[y].identifierTypeId;
          let idVal = ids[y].value;
          let url = `${config.okapi}/instance-storage/instances?query=(identifiers%20=/@value/@identifierTypeId=${idType}%20%22${idVal}%22)` 
          console.log(`[${x}.${y}] GET ${url}`);
          try {
            let res = await superagent
              .get(url)
              .set('x-okapi-token', authToken)
              .set('accept', 'application/json');
            let inst = res.body.instances;
            if (inst.length > 0) {
              linkId = inst[0].id;
              rec.precedingInstanceId = linkId;
              console.log(`INFO match found for ${linkId}`);
              break;
            }
          } catch (e) {
            console.log(e);
          }
        }
      }
      let out = JSON.stringify(rec) + '\n';
      fs.writeFileSync(outPath, out, { flag: 'as' })
    }
    const end = new Date().valueOf();
    const ms = end - start;
    const time = Math.floor(ms / 1000);
  } catch (e) {
    console.error(e);
  }
})();
