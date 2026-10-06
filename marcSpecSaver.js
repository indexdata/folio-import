const fs = require('fs');
const superagent = require('superagent');
const { getAuthToken } = require('./lib/login');
const argv = require('minimist')(process.argv.slice(2));

let dir = argv._[0];
let lim = (argv.l !== undefined) ? argv.l : 100000;
let stype = (argv.p === 'bib') ? 'bibliographic' : (argv.p === 'auth') ? 'authority' : '';
let scope = argv.s || 'local';

let base = 'specification-storage';

const files = {
  c: 'comp-specs.json',
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
      .timeout({response: 10000})
      .set('User-Agent', config.agent)
      .set('cookie', config.cookie)
      .set('x-okapi-tenant', config.tenant)
      .set('x-okapi-token', config.token)
      .set('accept', 'application/json');
    return res.body;
  } catch(e) {
    throw new Error(e);
  }
}

const arr = (obj, prop, filename) => {
  let rec = [];
  let c = 0;
  for (let x = 0; x < obj[prop].length; x++) {
    if (stype && prop === 'specifications') {
      if (obj[prop][x].profile !== stype) {
        continue;
      } 
    }
    if (prop === 'fields' && obj[prop][x].scope !== scope) continue;
    c++;
    if (c > lim) break;
    delete obj[prop][x].metadata;
    rec.push(obj[prop][x]);
    if (filename) writeJSONL(filename, obj[prop][x]);
  }
  return(rec);
}

(async () => {
  try {
    if (!dir) throw('Usage: marcSpecSaver <save_dir> [ -l <limit>, -p <profile: bib|auth> ]');
    if (argv.p && !(argv.p === 'bib' || argv.p === 'auth')) throw(`Incorrect profile type: "${argv.p}" (must be "bib" or "auth")`);
    dir = dir.replace(/\/$/, '');
    for (let k in files) {
      files[k] = dir + '/' + files[k];
      if (files[k].match(/jsonl$/) && fs.existsSync(files[k])) fs.unlinkSync(files[k]);
    }

    let config = await getAuthToken(superagent);

    let res = await get(config, `${base}/specifications`)
    let spec = arr(res, 'specifications', files.s);
    for (let x = 0; x < spec.length; x++) {
      let sid = spec[x].id;
      let res = await get(config, `${base}/specifications/${sid}/rules`);
      let rules = arr(res, 'rules', files.r);
      spec[x].rules = rules;
      res = await get(config, `${base}/specifications/${sid}/fields`);
      let fields = arr(res, 'fields', files.f);
      spec[x].fields = fields;
      for (let y = 0; y < spec[x].fields.length; y++) {
        let fid = spec[x].fields[y].id;
        let res = await get(config, `${base}/fields/${fid}/subfields`)
        let subfields = arr(res, 'subfields', files.u);
        spec[x].fields[y].subfields = subfields; 
        res = await get(config, `${base}/fields/${fid}/indicators`)
        let inds = arr(res, 'indicators', files.i);
        spec[x].fields[y].indicators = inds;
        for (let z = 0; z < spec[x].fields[y].indicators.length; z++) {
          let iid = spec[x].fields[y].indicators[z].id;
          let res = await get(config, `${base}/indicators/${iid}/indicator-codes`);
          let icodes = arr(res, 'codes', files.ic);
          spec[x].fields[y].indicators[z].codes = icodes;          
        }
      }
    }
    fs.writeFileSync(files.c, JSON.stringify(spec, null, 2));

  } catch(e) {
    console.log(e);
  }
})();
