const fs = require('fs');
const superagent = require('superagent');
const { getAuthToken } = require('./lib/login');
let refDir = process.argv[2];
let size = parseInt(process.argv[3], 10) || 10000;
let offset = parseInt(process.argv[4], 10) || 0;

(async () => {
  try {
    if (!refDir) {
      throw new Error('Usage: node downloadSourceRecords.js <download_dir> [ <collection_size> [ offset ]]');
    } else if (!fs.existsSync(refDir)) {
      throw new Error('Download directory does\'t exist!');
    } else if (!fs.lstatSync(refDir).isDirectory()) {
      throw new Error(`${refDir} is not a directory!`)
    }
    const config = (fs.existsSync('./config.js')) ? require('./config.js') : require('./config.default.js');

    const authToken = await getAuthToken(superagent, config.okapi, config.tenant, config.authpath, config.username, config.password);

    refDir = refDir.replace(/\/$/,'');

    const actionUrl = `${config.okapi}/source-storage/records`;

    let totFetch = 0 + offset;
    let totRecs = 1000000;
    let perPage = 1000;
    let part = 0;
    const coll = { records: [] };
    while (totFetch < totRecs) {
      let url = `${actionUrl}?limit=${perPage}&offset=${offset}`;
      try {
        let res = await superagent
          .get(url)
          .timeout({response: 120000})
          .set('accept', 'application/json')
          .set('x-okapi-token', authToken);
        coll.records = coll.records.concat(res.body.records);
        totFetch += res.body.records.length;
        totRecs = res.body.totalRecords;
      } catch (e) {
        try {
          throw new Error(e.response.text);
        } catch {
          throw new Error(e.message);
        }
      }
      offset += perPage;
      console.log(url);
      console.log(`Received ${totFetch} of ${totRecs}...`);
      if (totFetch % size == 0 || totFetch >= totRecs) {
        let saveSize = coll.records.length;
        let partPadded = part.toString().padStart(5, '0');
        let fn = `${refDir}/records${partPadded}.json`
        console.log(`Writing ${saveSize} records to ${fn}...`);
        const jsonStr = JSON.stringify(coll, null, 2);
        fs.writeFileSync(fn, jsonStr);
        coll.records = [];
        part++;
      }
    }
  } catch (e) {
    console.error(e.message);
  }
})();
