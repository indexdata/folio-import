const fs = require('fs');
const superagent = require('superagent');
const { getAuthToken } = require('./lib/login');
let ep = process.argv[2];
let refDir = process.argv[3];
let start = parseInt(process.argv[4], 10);
let limit = parseInt(process.argv[5], 10);

(async () => {
  try {
    if (!refDir) {
      throw new Error('Usage: node downloadAllByEndpoint.js <endpoint[.field,field,field...]> <download_dir> [ <start> <stop> ]');
    } else if (!fs.existsSync(refDir)) {
      throw new Error('Reference directory does\'t exist!');
    } else if (!fs.lstatSync(refDir).isDirectory()) {
      throw new Error(`${refDir} is not a directory!`)
    }
    const config = (fs.existsSync('./config.js')) ? require('./config.js') : require('./config.default.js');

    const authToken = await getAuthToken(superagent, config.okapi, config.tenant, config.authpath, config.username, config.password);

    refDir = refDir.replace(/\/$/,'');

    let epf = ep.split(/\./);
    let endPoint = epf[0];
    let fields = [];
    if (epf[1]) {
      fields = epf[1].split(/,/);
    }

    const actionUrl = config.okapi + '/' + endPoint;
    const filename = endPoint.replace(/\//g, '__');

    let totFetch = 0;
    let totRecs = 1000000;
    let perPage = 1000;
    let offset = start || 0;
    const coll = {};
    while (totFetch < totRecs) {
      let prop;
      let url = `${actionUrl}?limit=${perPage}&offset=${offset}`;
      try {
        let res = await superagent
          .get(url)
          .timeout({response: 10000})
          .set('accept', 'application/json')
          .set('x-okapi-token', authToken);
        for (let x in res.body) {
          if (Array.isArray(res.body[x])) {
            prop = x;
          }
        }
        if (!coll[prop]) {
          coll[prop] = [];
        }
        if (fields[0]) {
          for (let r = 0; r < res.body[prop].length; r++) {
            let rec = res.body[prop][r];
            let data = {};
            for (let f = 0; f < fields.length; f++) {
              let fname = fields[f];
              data[fname] = rec[fname];
            }
            res.body[prop][r] = data;
          }
        }
        coll[prop] = coll[prop].concat(res.body[prop]);
        totFetch = coll[prop].length;
        if (start) {
          totFetch += start;
        }
        totRecs = limit || res.body.totalRecords;
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
    }
    const fn = `${refDir}/${filename}.json`;
    console.log(`Writing to ${fn}`);
    const jsonStr = JSON.stringify(coll, null, 2);
    fs.writeFileSync(fn, jsonStr);
  } catch (e) {
    console.error(e.message);
  }
})();
