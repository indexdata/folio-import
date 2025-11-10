const fs = require('fs');
const superagent = require('superagent');
const { getAuthToken } = require('./lib/login');
const fileName = process.argv[2];
let delay = 5000;
const dbug = process.env.DEBUG;

const wait = (ms) => {
  console.log(`(Waiting ${ms}ms...)`);
  return new Promise((resolve) => setTimeout(resolve, ms));
};

(async () => {
  try {
    if (!fileName) {
      throw new Error(`Usage: node userImportLoad.js <user_import_file> <batch_size>`);
    }

    let ul = (process.argv[3]) ? parseInt(process.argv[3], 10) : 5000;
    console.log('INFO Batch size set to:', ul);
    const inData = require(fileName);
    const config = await getAuthToken(superagent);
    let url = config.okapi + '/user-import';
    let batches = [];

    if (inData.users && inData.users.length > ul) {
      console.log(`Splitting users into groups of ${ul}`)
      while (inData.users.length > 0) {
        let b = JSON.parse(JSON.stringify(inData));
        b.users = inData.users.splice(0, ul);
        b.totalRecords = b.users.length;
        batches.push(b);
      }
    } else {
      batches.push(inData);
    }
    for (x = 0; x < batches.length; x++) {
      let c = x + 1;
      console.log(`Sending batch ${c} (${batches[x].totalRecords} users) of ${batches.length}...`);
      let lfile = `${fileName}.${c}.log`;
      try {
        let res = await superagent
          .post(url)
          .send(batches[x])
          .set('User-Agent', config.agent)
          .set('cookie', config.cookie)
          .set('x-okapi-tenant', config.tenant)
          .set('x-okapi-token', config.token)
          .set('content-type', 'application/json');
        console.log(res.body);
        fs.writeFileSync(lfile, JSON.stringify(res.body, null, 2) + '\n');
      } catch (e) {
        if (dbug) {
          console.log(e);
        } else {
          console.log(`${e}`);
        }
        fs.writeFileSync(lfile, `${e}` + '\n');
      }
      if (c < batches.length) await wait(delay);
    } 
  } catch (e) {
    if (dbug) {
      console.log(e);
    } else {
      console.log(e.message);
    }
  }
})();
