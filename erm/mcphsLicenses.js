const parse = require('csv-parse/lib/sync');
const fs = require('fs');
const uuid = require('uuid/v5');
const path = require('path');

let refDir = process.argv[2];
const inFile = process.argv[3];
const dbug = process.env.DEBUG;
const ns = '3f32a0f4-be48-4cba-b02e-27633ca9518f';
const unit = 'Boston';

const files = {
  lic: 'licenses.jsonl'
};

const rfiles = {
  organizations: 'organizations.json',
  cprops: 'licenses-custprops.json'
};

const statusMap = {
  'Awaiting Document': 'in_negotiation',
  'Complete': 'active',
  'Document Only': 'active',
  'Editing Expressions': 'active',
  'NLR': 'active'
};

const scriptName = process.argv[1].replace(/^.+\//, '');

try {
  if (!inFile) throw(`Usage: node.js ${scriptName} <ref_dir> <licenses_csv_file>`);

  const dir = path.dirname(inFile);

  for (let f in files) {
    let fn = dir + '/' + files[f];
    if (fs.existsSync(fn)) {
      fs.unlinkSync(fn);
    }
    files[f] = fn;
  }

  const writeTo = (fileName, data) => {
    let outStr = JSON.stringify(data) + '\n';
    fs.writeFileSync(fileName, outStr, { flag: 'a' });
  }
  
  refDir = refDir.replace(/\/$/, '');
  const ref = {};
  const custProps = {};
  for (let f in rfiles) {
    let rfile = refDir + '/' + rfiles[f];
    let rdata = require(rfile);
    ref[f] = {};
    if (f === 'cprops') {
      rdata.forEach(r => {
        let k = r.label;
        let v = r.name;
        ref[f][k] = v;
        custProps[v] = [{ _delete: true }];
      });
    } else {
      rdata[f].forEach(r => {
        let k = (f === 'organizations') ? r.code : r.name;
        let v = (f === 'organizations') ? {id: r.id, name: r.name} : r.id;
        ref[f][k] = v;
      });
    }
  }
  // console.log(ref); return;

  let csv = fs.readFileSync(`${inFile}`, 'utf8');
  const inRecs = parse(csv, {
    columns: true,
    skip_empty_lines: true,
    relax_quotes: true,
    delimiter: '|',
    bom: true,
    trim: true,
    escape: '\\'
  });

  let today = new Date().toISOString().substring(0, 10);
  const seen = {
    main: {},
    org: {}
  }
  let l;
  let last = inRecs.length;
  let prevId = '';
  let c = 0;
  inRecs.forEach(r => {
    c++;
    for (let f in r) {
      r[f] = r[f].replace(/\\N/g, '');
    }
    let id = r['License ID'];
    let oid = r['License Organization'];
    let orgKey = id + ':' + oid;
    if (!seen.main[id]) {
      let status = r['License Status'];
      let name = r['License Name'];
      l = {
        id: id,
        name: name,
        status: statusMap[status],
        type: 'local',
        customProperties: custProps,
        openEnded: false,
        orgs: []
      };
      seen.main[id] = 1;
    }
    if (!seen.org[orgKey]) {
      let org = ref.organizations[oid];
      seen.org[orgKey] = 1;
    }
    if (prevId !== id || c === last && prevId !== id) {
      console.log(l);
      writeTo(files.lic, l);
    }
    prevId = id;
  });
  
  console.log('Finished!');
} catch (e) {
  console.log(e);
}
