const fs = require('fs');
const superagent = require('superagent');
const { getAuthToken } = require('./lib/login');
const fn = process.argv[2]; 
const del = process.argv[3];

delFlag = (del && del === 'DELETE') ? true : false;

let endpoints = [
  'departments',
  'terms',
  'courselistings',
  'courses',
  'instructors',
  'reserves',
];

let cl = console.log;
const logSeen = {}
let lpath;
console.log = (msg) => {
  if (lpath) {
    if (!logSeen[lpath] && fs.existsSync(lpath)) fs.unlinkSync(lpath);
    fs.writeFileSync(lpath, msg + '\n', { flag: 'a'});
    logSeen[lpath] = 1;
  } else {
    cl(msg);
  }
}

(async () => {
  let added = {};
  let errors = {};
  let deleted = {};
  try {
    if (!fn) {
      throw new Error('Usage: node loadCourses.js <file> [DELETE]');
    }
    const config = await getAuthToken(superagent);
    let logDir = config.logpath;
    if (logDir) lpath = logDir + '/loadCourses.log';

    let collStr = fs.readFileSync(fn, 'utf8');
    let coll = JSON.parse(collStr);

    const base = `${config.okapi}/coursereserves`;

    if (delFlag) {
      endpoints = endpoints.reverse();
    }

    for (x = 0; x < endpoints.length; x++) {
      let p = endpoints[x];
      if (coll[p] && coll[p][0]) {
        let endpoint = p;
        let data = coll[p];
        added[p] = 0;
        deleted[p] = 0;
        errors[p] = 0;
        for (let d = 0; d < data.length; d++) {
          if (endpoint === 'instructors' || endpoint === 'reserves') {
            url = `${base}/courselistings/${data[d].courseListingId}/${endpoint}`;
          } else {
            url = `${base}/${endpoint}`;
            url = url.toLocaleLowerCase();
          }
          try {
            if (delFlag) {
              url += `/${data[d].id}`;
              console.log(`[${deleted[p]}] DELETE ${url}`);
              await superagent
                .delete(url)
                .timeout({ response: 5000 })
                .set('accept', 'text/plain')
                .set('x-okapi-token', config.token)
              deleted[p]++;
            } else {
              console.log(`[${added[p]}] POST ${url}`);
              let res = await superagent
                .post(url)
                .timeout({ response: 5000 })
                .set('accept', 'application/json', 'text/plain')
                .set('x-okapi-token', config.token)
                .set('content-type', 'application/json')
                .send(data[d]);
              added[p]++;
            }
          } catch (e) {
            console.log(`${e}`);
            errors[p]++;
          }
        }
      }
    }
  } catch (e) {
    console.error(e.message);
  }
  console.log('------ Added ---------');
  for (let k in added) {
    let l = k.padEnd(16, ' ')
    console.log(`${l}${added[k]}`);
  }
  console.log('------ Deleted -------');
  for (let k in deleted) {
    let l = k.padEnd(16, ' ')
    console.log(`${l}${deleted[k]}`);
  }
  console.log('------ Errors --------');
  for (let k in errors) {
    let l = k.padEnd(16, ' ')
    console.log(`${l}${errors[k]}`);
  }
})();
