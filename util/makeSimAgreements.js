const parse = require('csv-parse/lib/sync');
const fs = require('fs');
const uuid = require('uuid/v5');

const inDir = process.argv[2];
const ns = '49619de6-63fe-47e9-a07b-698a313dc9e8';

const makeMap = (coll, key) => {
  if (!key) key = 'organizationID';
  newColl = {};
  coll.forEach(r => {
    let oid = r[key];
    delete r[key];
    if (!newColl[oid]) newColl[oid] = [];
    newColl[oid].push(r);
  });
  return newColl;
};

try {
  if (!inDir) throw new Error(`Usage: node makeSimAgreements.js <working_directory>`);
  const fns = fs.readdirSync(inDir);
  const inRecs = {};
  let orgs = [];

  let fileSeen = {};

  const writer = (name, data) => {
    let outFile = `${inDir}/${name}.jsonl`;
    if (!fileSeen[outFile] && fs.existsSync(outFile)) fs.unlinkSync(outFile);
    fs.writeFileSync(outFile, JSON.stringify(data) + '\n', { flag: 'a' });
    fileSeen[outFile] = 1;
  }

  fns.forEach(fn => {
    if (fn.match(/\.csv$/)) {
      let name = fn.replace(/\.csv/, '');
      name = name.replace(/-(.)/g, (m) => { return m[1].toUpperCase() });
      console.log(name);
      let csv = fs.readFileSync(`${inDir}/${fn}`, 'utf8');
      csv = csv.replace(/NULL/g, '');
      inRecs[name] = parse(csv, {
        columns: true,
        skip_empty_lines: true
      });
    }
  });

  inRecs.resourceResources.forEach(r => {
    console.log(r.resourceID);
  });

} catch (e) {
  console.log(e);
}
