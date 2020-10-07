const fs = require('fs');
const superagent = require('superagent');
const { getAuthToken } = require('./lib/login');
let refDir = process.argv[2];
let start = parseInt(process.argv[3], 10);
let limit = parseInt(process.argv[4], 10);

(async () => {
  try {
    if (!refDir) {
      throw new Error('Usage: node downloadAllItems.js <download_dir> <start> <stop>');
    } else if (!fs.existsSync(refDir)) {
      throw new Error('Reference directory does\'t exist!');
    } else if (!fs.lstatSync(refDir).isDirectory()) {
      throw new Error(`${refDir} is not a directory!`)
    }
    const config = (fs.existsSync('./config.js')) ? require('./config.js') : require('./config.default.js');

    const authToken = await getAuthToken(superagent, config.okapi, config.tenant, config.authpath, config.username, config.password);

    refDir = refDir.replace(/\/$/,'');

    const actionUrl = config.okapi + '/item-storage/items';

    let totFetch = 0;
    let totRecs = 1000000;
    let perPage = 100;
    let offset = start || 0;
    const coll = { items: [] };
    while (totFetch < totRecs) {
      let url = `${actionUrl}?limit=${perPage}&offset=${offset}`;
      try {
        let res = await superagent
          .get(url)
          .timeout({response: 10000})
          .set('accept', 'application/json')
          .set('x-okapi-token', authToken);
        coll.items = coll.items.concat(res.body.items);
        totFetch = coll.items.length;
        if (start) {
          totFetch += start;
        }
        totRecs = limit || res.body.totalRecords;
      } catch (e) {
        try {
          console.log(e.response.text);
        } catch {
          console.log(e.message);
        }
      }
      offset += perPage;
      console.log(url);
      console.log(`Received ${totFetch} of ${totRecs}...`);
    }
    const fn = `${refDir}/items.json`
    console.log(`Writing to ${fn}`);
    const jsonStr = JSON.stringify(coll, null, 2);
    fs.writeFileSync(fn, jsonStr);
  } catch (e) {
    console.error(e.message);
  }
})();
