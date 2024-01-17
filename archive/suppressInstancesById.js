/*
  This script will take a file of instance ids and suppress from discovery and staff.
*/

const fs = require('fs');
const superagent = require('superagent');
const { getAuthToken } = require('./lib/login');
const readline = require('readline');

let inFile = process.argv[2];

(async () => {
  try {
    if (!inFile) {
      throw new Error('Usage: node suppressInstances.js <instance ids>');
    } else if (!fs.existsSync(inFile)) {
      throw new Error('Can\'t find data file');
    }
    
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
      let url = `${config.okapi}/instance-storage/instances/${id}`;
      console.log(`# ${x} GET loan ${url}`);
      try {
        let res = await superagent
          .get(url)
          .set('x-okapi-token', authToken)
          .set('accept', 'application/json');
        let rec = res.body;
        if (rec) {
          let payload = rec;
          payload.discoverySuppress = true;
          payload.staffSuppress = true;
          try {
            let purl = `${config.okapi}/inventory/instances/${id}`;
            console.log(`  PUT ${purl}`)
            let res = await superagent
              .put(purl)
              .send(payload)
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
    } 
  } catch (e) {
    console.log(e.message);
  }
})();
