const fs = require('fs');
const superagent = require('superagent');
const { getAuthToken } = require('./lib/login');
let endPoint = process.argv[2];
let fileName = process.argv[3];
let start = parseInt(process.argv[4], 10);
let limit = parseInt(process.argv[5], 10);
let fn;
let writeStream;
let dbug = process.env.DEBUG;

(async () => {
  try {
    if (!fileName) {
      throw new Error('Usage: node downloadJSONL.js <endpoint> <filename> [ <start> <stop> ]');
    }

    let config = await getAuthToken(superagent);

    if (endPoint.match(/^_\//)) {
      endPoint = endPoint.replace(/^_\//, '');
      endPoint = endPoint.replace(/__/, '/');
    }

    endPoint = endPoint.replace(/^\//, '');

    let actionUrl = config.okapi + '/' + endPoint;
    let lm = endPoint.match(/limit=(\d+)/);

    fn = fileName;
    if (fs.existsSync(fn)) {
      if (fs.lstatSync(fn).isDirectory()) {
        throw new Error(`${fileName} is a directory`);
      } else {
        fs.unlinkSync(fn);
      }
    }
    console.log(`Writing to ${fn}`);
    writeStream = fs.createWriteStream(fn);

    let totFetch = 0;
    let totRecs = 1000000;
    let perPage = (lm) ? parseInt(lm[1], 10) : 1000;
    let offset = start || 0;
    while (totFetch < totRecs) {
      let prop;
      let url = (actionUrl.match(/\?/)) ? actionUrl : `${actionUrl}?limit=${perPage}&offset=${offset}&query=cql.allRecords=1 sortBy id`;
      if (actionUrl.match(/\/(licenses|erm)\//)) {
	      perPage = 100;
	      url = `${actionUrl}?perPage=${perPage}&offset=${offset}&stats=true`;
      } else if (actionUrl.match(/\/perms\//)) {
        let permStart = offset + 1;
        perPage = 5000;
	      url = `${actionUrl}?length=${perPage}&start=${permStart}&stats=true`;
      } else if (actionUrl.match(/inventory\/items/)) {
        perPage = 100;
        url = `${actionUrl}?limit=${perPage}&offset=${offset}`;
      } else if (actionUrl.match(/authority-storage/)) {
	      perPage = 1000;
	      url = `${actionUrl}?limit=${perPage}&offset=${offset}`;
      }
      if (!url.match(/offset=\d/)) url += `&offset=${offset}`;
      try {
        console.log(`GET ${url}`);
        let res = await superagent
          .get(url)
          .timeout({response: 10000})
          .set('User-Agent', config.agent)
          .set('cookie', config.cookie)
          .set('x-okapi-tenant', config.tenant)
          .set('x-okapi-token', config.token)
          .set('accept', 'application/json')
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
        totRecs = limit || res.body.totalRecords || res.body.resultInfo.totalRecords;
        for (let y = 0; y < recs.length; y++) {
          let rec = JSON.stringify(recs[y]);
          writeStream.write(rec + '\n', 'utf8');
        }
      } catch (e) {
	    if (dbug) console.log(e);
         throw new Error(e);
      }
      offset += perPage;
      console.log(url);
      // if (actionUrl.match(/\/perms\//)) { totRecs = totFetch }
      console.log(`Received ${totFetch} of ${totRecs}...`);
    }
  } catch (e) {
    if (dbug) {
        console.log(e);
    } else {
    	console.error(e.message);
    }
    if (writeStream) fs.unlinkSync(fn);
  }
})();
