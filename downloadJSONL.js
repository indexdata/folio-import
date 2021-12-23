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
      throw new Error('Usage: node downloadJSONL.js <endpoint> <download_dir> [ <start> <stop> ]');
    } else if (!fs.existsSync(refDir)) {
      throw new Error('Reference directory does\'t exist!');
    } else if (!fs.lstatSync(refDir).isDirectory()) {
      throw new Error(`${refDir} is not a directory!`)
    }
    const config = (fs.existsSync('./config.js')) ? require('./config.js') : require('./config.default.js');

    const authToken = await getAuthToken(superagent, config.okapi, config.tenant, config.authpath, config.username, config.password);

    refDir = refDir.replace(/\/$/,'');

    let endPoint = ep;

    let queryStr = '?query=id=*%20sortBy%20id';
    if (endPoint.match(/query=/)) queryStr = '';
    let actionUrl = config.okapi + '/' + endPoint + queryStr;
    let filename = endPoint.replace(/\//g, '__');
    filename = filename.replace(/\?.+/, '');

    const fn = `${refDir}/${filename}.json`;
    if (fs.existsSync(fn)) {
      fs.unlinkSync(fn);
    }
    console.log(`Writing to ${fn}`);
    let writeStream = fs.createWriteStream(fn);

    let totFetch = 0;
    let totRecs = 1000000;
    let perPage = 500;
    let offset = start || 0;
    while (totFetch < totRecs) {
      let prop;
      let url = `${actionUrl}&limit=${perPage}&offset=${offset}`;
      if (actionUrl.match(/\/(licenses|erm)\//)) {
	      perPage = 100;
	      url = `${actionUrl}&perPage=${perPage}&offset=${offset}&stats=true`;
      } else if (actionUrl.match(/\/perms\//)) {
        let permStart = offset + 1;
        perPage = 5000;
	      url = `${actionUrl}&length=${perPage}&start=${permStart}&stats=true`;
      }
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
        let recs = res.body[prop];
        if (start) {
          totFetch += start;
          start = 0;
        }
        totFetch += recs.length;
        totRecs = limit || res.body.totalRecords;
        for (let y = 0; y < recs.length; y++) {
          let rec = JSON.stringify(recs[y]);
          writeStream.write(rec + '\n', 'utf8');
        }
      } catch (e) {
        try {
          throw new Error(e.response.text);
        } catch {
          throw new Error(e.message);
        }
      }
      offset += perPage;
      console.log(url);
      if (actionUrl.match(/\/perms\//)) { totRecs = totFetch }
      console.log(`Received ${totFetch} of ${totRecs}...`);
    }
  } catch (e) {
    console.error(e.message);
  }
})();
