const fs = require('fs');
const superagent = require('superagent');
const { getAuthToken } = require('./lib/login');
let endPoint = process.argv[2];
let fileName = process.argv[3];
let start = parseInt(process.argv[4], 10);
let limit = parseInt(process.argv[5], 10);
let fn;
let writeStream;

(async () => {
  try {
    if (!fileName) {
      throw new Error('Usage: node downloadJSONL.js <endpoint> <filename> [ <start> <stop> ]');
    }
    const config = (fs.existsSync('./config.js')) ? require('./config.js') : require('./config.default.js');

    const authToken = await getAuthToken(superagent, config.okapi, config.tenant, config.authpath, config.username, config.password);

    if (endPoint.match(/^.x/)) {
      endPoint = endPoint.replace(/^.x\//, '');
      endPoint = endPoint.replace(/__/, '/');
    }

    endPoint = endPoint.replace(/^\//, '');

    let actionUrl = config.okapi + '/' + endPoint;
    let filename = endPoint.replace(/\//g, '__');
    filename = filename.replace(/\?.+/, '');

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
    let perPage = 1000;
    let offset = start || 0;
    while (totFetch < totRecs) {
      let prop;
      let url = `${actionUrl}?limit=${perPage}&offset=${offset}`;
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
      // if (actionUrl.match(/\/perms\//)) { totRecs = totFetch }
      console.log(`Received ${totFetch} of ${totRecs}...`);
    }
  } catch (e) {
    console.error(e.message);
    if (writeStream) fs.unlinkSync(fn);
  }
})();
