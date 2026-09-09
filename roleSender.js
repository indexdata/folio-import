const fs = require('fs');
const superagent = require('superagent');
const { getAuthToken } = require('./lib/login');
let dbug = process.env.DEBUG;
let eps = [ 'roles', 'roles/capabilities', 'roles/capability-sets' ];
let dir = process.argv[2];

const postThing = async (config, ep, obj) => {
  let url = `${config.okapi}/${ep}`;
  console.log(url);
  try {
    let res = await superagent
      .post(url)
      .send(obj)
      .set('x-okapi-tenant', config.tenant)
      .set('cookie', config.cookie);
    return res.body
  } catch (e) {
    throw new Error(e);
  }
}

(async () => {
  try {
    if (!dir) throw('Usage: roleSender.js <objects_dir>');
    dir = dir.replace(/\/$/, '');

    let config = await getAuthToken(superagent);
    
    let rmap = {};
    for (let x = 0; x < eps.length; x++) {
      let ep = eps[x];
      let fn = ep.replace(/^.+\//, '');
      fn = dir + '/' + fn + '.jsonl';
      let blob = fs.readFileSync(fn, { encoding: 'utf8' });
      let lines = blob.split(/\n/);
      for (let y = 0; y < lines.length; y++) {
        if (!lines[y]) continue;
        let obj = JSON.parse(lines[y]);
        if (fn.match(/roles.jsonl$/)) {
          let newObj = await postThing(config, ep, obj);
          rmap[newObj.name] = newObj.id;
        } else if (fn.match(/capability-sets.jsonl$/)) {
          let rname = obj.roleId || '';
          let rid = rmap[rname];
          if (rid) {
            obj.roleId = rid;
            console.log(obj);
          }
        }
      }
    }
    console.log(rmap);

      
  } catch (e) {
    console.log(e);
  }
})();
