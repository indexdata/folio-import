const fs = require('fs');
const superagent = require('superagent');
const { getAuthToken } = require('./lib/login');
let dbug = process.env.DEBUG;
let eps = [ 'roles', 'roles/capabilities', 'roles/capability-sets' ];
let dir = process.argv[2];

(async () => {
  try {
    if (!dir) throw('Usage: roleSaver.js <save_dir>');
    dir = dir.replace(/\/$/, '');

    let config = await getAuthToken(superagent);

    let roleMap = {};
    for (let x = 0; x < eps.length; x++) {
      let ep = eps[x];
      let fn = ep.replace(/^.+\//, '');
      fn = dir + '/' + fn + '.jsonl';
      if (fs.existsSync(fn)) fs.unlinkSync(fn);
      let url = `${config.okapi}/${ep}?limit=5000`;
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
        for (let y = 0; y < recs.length; y++) {
          let r = recs[y]
          if (ep === 'roles') {
            roleMap[r.id] = r.name;
          } else {
            r.roleId = roleMap[r.roleId];
          }
          let rstr = JSON.stringify(r);
          fs.writeFileSync(fn, rstr + '\n', { flag: 'a' });
        }
      } catch (e) {
        if (dbug) console.log(e);
          throw new Error(e);
        }
    }
    console.log(roleMap);
  } catch (e) {
    console.log(e);
  }
})();
