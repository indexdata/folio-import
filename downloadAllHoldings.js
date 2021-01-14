const fs = require('fs');
const superagent = require('superagent');
const { getAuthToken } = require('./lib/login');
const argv = require('minimist')(process.argv.slice(2));

let refDir = argv._[0];
let start = parseInt(argv.s, 10) || 0;
let limit = parseInt(argv.l, 10);
let query = '';
if (argv.q) query = 'query=' + argv.q + '&';


(async () => {
  try {
    if (!refDir) {
      throw new Error('Usage: node downloadAllHoldings.js  [-l limit, -s start, -q query ] <download_dir>');
    } else if (!fs.existsSync(refDir)) {
      throw new Error('Download directory does\'t exist!');
    } else if (!fs.lstatSync(refDir).isDirectory()) {
      throw new Error(`${refDir} is not a directory!`)
    }
    const config = (fs.existsSync('./config.js')) ? require('./config.js') : require('./config.default.js');

    const authToken = await getAuthToken(superagent, config.okapi, config.tenant, config.authpath, config.username, config.password);

    refDir = refDir.replace(/\/$/,'');

    const actionUrl = config.okapi + '/holdings-storage/holdings';

    let totFetch = 0;
    let totRecs = 1000000;
    let perPage = 1000;
    let offset = start || 0;
    const coll = { holdingsRecords: [] };
    while (totFetch < totRecs) {
      let url = `${actionUrl}?${query}limit=${perPage}&offset=${offset}`;
      try {
        let res = await superagent
          .get(url)
          .timeout({response: 10000})
          .set('accept', 'application/json')
          .set('x-okapi-token', authToken);
        coll.holdingsRecords = coll.holdingsRecords.concat(res.body.holdingsRecords);
        totFetch = coll.holdingsRecords.length;
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
    const fn = `${refDir}/holdings.json`
    console.log(`Writing to ${fn}`);
    const jsonStr = JSON.stringify(coll, null, 2);
    fs.writeFileSync(fn, jsonStr);
  } catch (e) {
    console.error(e.message);
  }
})();
