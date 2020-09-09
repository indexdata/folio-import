const fs = require('fs');
const superagent = require('superagent');
const { getAuthToken } = require('./lib/login');
const argv = require('minimist')(process.argv.slice(2));

let refDir = argv._[0];
let size = parseInt(argv.s, 10) || 10000;
let offset = parseInt(argv.o, 10) || 0;

(async () => {
  try {
    if (!refDir) {
      throw new Error('Usage: node downloadSourceRecords.js [ -s collection size, -l jsonl output, -o offset ] <download_dir>');
    } else if (!fs.existsSync(refDir)) {
      throw new Error('Download directory does\'t exist!');
    } else if (!fs.lstatSync(refDir).isDirectory()) {
      throw new Error(`${refDir} is not a directory!`)
    }
    const config = (fs.existsSync('./config.js')) ? require('./config.js') : require('./config.default.js');

    const authToken = await getAuthToken(superagent, config.okapi, config.tenant, config.authpath, config.username, config.password);

    refDir = refDir.replace(/\/$/,'');
    const jsonlFile = `${refDir}/records.jsonl`;

    const actionUrl = `${config.okapi}/source-storage/records`;
    recObj = 'records';

    let totFetch = 0 + offset;
    let totRecs = 1000000;
    let perPage = 1000;
    let part = 0;
    const coll = { records: [] };
    if (argv.l && fs.existsSync(jsonlFile)) {
      fs.unlinkSync(jsonlFile)
    }
    while (totFetch < totRecs) {
      let url = `${actionUrl}?limit=${perPage}&offset=${offset}`;
      console.log(url);
      let startTime = new Date().valueOf();
      try {
        let res = await superagent
          .get(url)
          .timeout({response: 120000})
          .set('accept', 'application/json')
          .set('x-okapi-token', authToken);
        if (argv.l) {
          let recs = res.body[recObj];
          console.log(`Writing ${recs.length} lines to ${jsonlFile}`)
          for (let x = 0; x < recs.length; x++) {
            let rec = JSON.stringify(recs[x]) + '\n';
            fs.writeFileSync(jsonlFile, rec, { flag: 'a'});
          }
        } else {
          coll.records = coll.records.concat(res.body[recObj]);
        }
        totFetch += res.body[recObj].length;
        totRecs = res.body.totalRecords; 
      } catch (e) {
        try {
          throw new Error(e.response.text);
        } catch {
          throw new Error(e.message);
        }
      }
      let endTime = new Date().valueOf();
      let sec = (endTime - startTime) / 1000;
      offset += perPage;
      console.log(`Received ${totFetch} of ${totRecs} records in ${sec} sec`);
      if ((totFetch % size == 0 || totFetch >= totRecs) && ! argv.l) {
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
