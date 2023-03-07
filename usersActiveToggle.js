/*
  This script takes a checkout-by-barcode file and sets user.active to true if currently false (and vice-versa)
*/

const fs = require('fs');
const superagent = require('superagent');
const { getAuthToken } = require('./lib/login');
const readline = require('readline');

const fn = process.argv[2];
const tf = process.argv[3];

(async () => {
  try {
    if (!fn) {
      throw new Error(`Usage: node usersActiveToggle.js <inactive_users_jsonl> [true|false]`);
    }
    const config = (fs.existsSync('./config.js')) ? require('./config.js') : require('./config.default.js');

    const authToken = await getAuthToken(superagent, config.okapi, config.tenant, config.authpath, config.username, config.password);

    let seen = {};

    const fileStream = fs.createReadStream(fn);
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });

    let d = 0;
    for await (const line of rl) {
      d++;
      let data = JSON.parse(line);
      let bc = data.barcode;
      if (!seen[bc]) {
        seen[bc] = 1;
        let url = `${config.okapi}/users?query=%28barcode%3D%3D%22${bc}%22%29`;
        try {
          console.log(`[${d}] GET ${url}...`);
          let res = await superagent
            .get(url)
            .timeout({ response: 5000 })
            .set('accept', 'application/json')
            .set('x-okapi-token', authToken)
          let userRecs = res.body;
          if (userRecs.resultInfo.totalRecords !== 1) throw new Error(`Did not fetch a single record for barcode ${bc}`);
          let user = userRecs.users[0];
          try {
            let purl = `${config.okapi}/users/${user.id}`;
            if (!user.active || tf === true) {
              user.active = true;
              user.expirationDate = '2025-12-31T00:00:00.000+0000'
            } else {
              user.active = false;
              user.expirationDate = (data.experationDate) ? data.expirationDate : null;
            }
            console.log(`     POST ${purl}...`);
            console.log(`     Changing user.active to "${user.active}"...`);
            await superagent
              .put(purl)
              .timeout({ response: 5000 })
              .set('accept', 'text/plain')
              .set('x-okapi-token', authToken)
              .set('content-type', 'application/json')
              .send(user);
          } catch (e) {
            console.log(e);
          }
        } catch (e) {
          console.log(e);
        } 
      } else {
        console.log(`[${d}] SKIPPING ${bc} already changed...`)
      }
    } 
  } catch (e) {
    console.error(e.message);
  }
})();
