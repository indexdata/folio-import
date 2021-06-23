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

  let acount = 0;
  inRecs.resourceResources.forEach((r) => {
    acount++;
    let a = {};
    let rid = r.resourceID
    a.id = uuid(rid, ns);
    a.name = r['Agreements/Name'];
    a.description = r['Agreements/Description'];
    a.renewalPriority = {
      label: 'For review',
      value: 'for_review'
    };
    a.agreementStatus = {
      label: r['Agreements/Status'],
      value: r['Agreements/Status'].toLowerCase()
    }
    a.periods = [];
    let owner = 'b8cd8aa9-d535-4f63-80d2-5260fb875b10';
    let startDate = '';
    if (r['subscriptionStartDate']) {
      startDate = new Date(r['subscriptionStartDate']).toISOString().replace(/T.+$/, '');
    }
    let endDate = '';
    if (r['subscriptionEndDate'].match(/^[12]/)) {
      endDate = new Date(r['subscriptionEndDate']).toISOString().replace(/T.+$/, '');
    }
    let period = {
      startDate: startDate,
      endDate: endDate,
      owner: { id: owner }
    }
    a.periods.push(period);
    a.customProperties = {};
    if (r['Resource URL']) {
      a.customProperties.resourceURL = [];
      let cp = {
        value: r['Resource URL']
      }
      a.customProperties.resourceURL.push(cp);
    }
    console.log(a);
    writer('resources', a);
  });

} catch (e) {
  console.log(e);
}
