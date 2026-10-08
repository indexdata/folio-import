const fs = require('fs');
const superagent = require('superagent');
const { getAuthToken } = require('./lib/login');
const argv = require('minimist')(process.argv.slice(2));

let compFile = argv._[0];

let base = 'specification-storage';

let tmap = {};

const files = {
  s: 'specs.jsonl',
  r: 'rules.jsonl',
  f: 'fields.jsonl',
  u: 'subfields.jsonl',
  i: 'indicators.jsonl',
  ic: 'indicator-codes.jsonl'
};

const writeJSONL = (filename, obj) => {
  let jstr = JSON.stringify(obj) + '\n';
  fs.writeFileSync(filename, jstr, { flag: 'a' });
}

const get = async (config, ep) => {
  let url = `${config.okapi}/${ep}`;
  console.log(`GET ${url}`);
  try {
    let res = await superagent
      .get(url)
      .set('User-Agent', config.agent)
      .set('cookie', config.cookie)
      .set('x-okapi-tenant', config.tenant)
      .set('x-okapi-token', config.token)
      .set('accept', 'application/json');
    return res.body;
  } catch(e) {
    console.log(e);
  }
}

const post = async (config, ep, pl) => {
  let url = `${config.okapi}/${ep}`;
  console.log(`POST ${url}`);
  try {
    let res = await superagent
      .post(url)
      .send(pl)
      .set('User-Agent', config.agent)
      .set('cookie', config.cookie)
      .set('x-okapi-tenant', config.tenant)
      .set('x-okapi-token', config.token)
      .set('content-type', 'application/json')
      .set('accept', 'application/json');
    return res.body;
  } catch(e) {
    console.log(e);
  }
}

const put = async (config, ep, pl) => {
  let url = `${config.okapi}/${ep}`;
  console.log(`PUT ${url}`);
  try {
    let res = await superagent
      .put(url)
      .send(pl)
      .set('User-Agent', config.agent)
      .set('cookie', config.cookie)
      .set('x-okapi-tenant', config.tenant)
      .set('x-okapi-token', config.token)
      .set('content-type', 'application/json')
      .set('accept', 'application/json');
    return res.body;
  } catch(e) {
    console.log(e);
  }
}

const postPut = async (config, ep, pl) => {
  let prop = ep.replace(/^.+\//, '');
  let mprop = prop.substring(0, 1);
  let k = (mprop === 'f') ? pl.tag : 'xxxx';
  let xid = tmap[mprop][k];
  if (xid) {
    let url = (mprop === 'f') ? `${base}/fields/${xid}` : '';
    let res = await put(config, url, pl);
    return xid;
  } else {
    let res = await post(config, ep, pl);
    return res.id;
  }
}

const makeMap = async (config, ep, prop) => {
  const mkey = prop.substring(0, 1);
  if (!tmap[mkey]) tmap[mkey] = {};
  const res = await get(config, ep);
  for (let x = 0; x < res[prop].length; x++) {
    let r = res[prop][x];
    let k = (mkey === 's') ? r.profile : (mkey === 'f') ? r.tag : '';
    tmap[mkey][k] = r.id;
  }
}

(async () => {
  try {
    if (!compFile) throw('Usage: marcSpecSender <comp_specs_file>');
    let compStr = fs.readFileSync(compFile, { encoding: 'utf8' });
    let comp = JSON.parse(compStr);

    let config = await getAuthToken(superagent);
    
    await makeMap(config, `${base}/specifications`, 'specifications');

    for (let x = 0; x < comp.length; x++) {
      for (let y = 0; y < comp[x].fields.length; y++) {
        let f = comp[x].fields[y];
        let specId = tmap.s[f.specificationId];
        let ep
        if (!tmap.f) {
          ep = `${base}/specifications/${specId}/fields`;
          await makeMap(config, ep, 'fields');
        }
        let subs = structuredClone(f.subfields);
        delete f.subfields;
        let inds = structuredClone(f.indicators);
        delete f.indicators;
        let fid = await postPut(config, ep, f);
        for (let z = 0; z < subs.length; z++) {
          let sub = subs[z];
          await postPut(config, `${base}/fields/${fid}/subfields`);
        }
      }
    }

  } catch(e) {
    console.log(e);
  }
})();
