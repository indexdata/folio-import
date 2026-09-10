const fs = require('fs');
const superagent = require('superagent');
const { getAuthToken } = require('./lib/login');
let dbug = process.env.DEBUG;
let eps = [ 'roles', 'roles/capabilities', 'roles/capability-sets' ];
let dir = process.argv[2];

const postThing = async (config, ep, obj) => {
  let url = `${config.okapi}/${ep}`;
  console.log('POST ' + url);
  try {
    let res = await superagent
      .post(url)
      .send(obj)
      .set('x-okapi-tenant', config.tenant)
      .set('cookie', config.cookie);
    return res.body
  } catch (e) {
    console.log(e);
  }
}

const putThing = async (config, ep, obj) => {
  let url = `${config.okapi}/${ep}`;
  console.log('PUT ' + url);
  try {
    let res = await superagent
      .put(url)
      .send(obj)
      .set('x-okapi-tenant', config.tenant)
      .set('cookie', config.cookie);
    return res.body
  } catch (e) {
    console.log(e);
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
          rmap[newObj.name] = { id: newObj.id, capabilitySetIds: [] }
        } else if (fn.match(/capability-sets.jsonl$/)) {
          let rname = obj.roleId || '';
          let role = rmap[rname];
          if (role) {
            role.capabilitySetIds.push(obj.capabilitySetId);
            // let ep = `roles/rid/capbility-sets`
          }
        }
      }
    }
    console.log(rmap);
    for (let k in rmap) {
      let id = rmap[k].id;
      delete rmap[k].id;
      let ep = `roles/${id}/capability-sets`
      await putThing(config, ep, rmap[k]);
    }
  } catch (e) {
    console.log(e);
  }
})();
