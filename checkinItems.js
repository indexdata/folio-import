const fs = require('fs');
const superagent = require('superagent');
const readline = require('readline');
const path = require('path');

const { getAuthToken } = require('./lib/login');
let spId = process.argv[2];
let inFile = process.argv[3];
let ep = 'circulation/check-in-by-barcode';

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

(async () => {
  try {
    const start = new Date().valueOf();
    let today = new Date().toISOString();
    if (!inFile) {
      throw 'Usage: node checkinItems <service_point_id> <jsonl_file>';
    } else if (!fs.existsSync(inFile)) {
      throw new Error('Can\'t find input file');
    } 

    let config = await getAuthToken(superagent);

    const actionUrl = `${config.okapi}/${ep}`;
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
      if (config.expiry && config.expiry <= lDate.valueOf()) {
        config = await getAuthToken(superagent);
      }
      let crec = {
        itemBarcode: rec.barcode,
        servicePointId: spId,
        checkInDate: today
      }
      console.log(`[${x}] POST ${rec.barcode} to ${actionUrl}`);
      try {
        let res = await superagent
          .post(actionUrl)
          .send(crec)
          .set('User-Agent', config.agent)
          .set('cookie', config.cookie)
          .set('x-okapi-tenant', config.tenant)
          .set('x-okapi-token', config.token)
          .set('content-type', 'application/json')
          .set('accept', 'application/json');
        success++;
      } catch (e) {
          let errMsg = (e.response && e.response.text) ? e.response.text : e;
          console.log(errMsg);
          fail++
      }
      if (config.delay) {
        await wait(config.delay);
      }
    }
    const end = new Date().valueOf();
    const ms = end - start;
    const time = Math.floor(ms / 1000);
    console.log(`\nTime:            ${time} sec`);
    console.log(`Successes:       ${success}`);
    console.log(`Failures:        ${fail}\n`);
  } catch (e) {
    console.error(e);
  }
})();
