const parse = require('csv-parse/lib/sync');
const fs = require('fs');
const uuid = require('uuid/v5');
const path = require('path');

const refDir = process.argv[2];
const inFile = process.argv[3];
const ns = 'f10a518f-d896-4f12-94b8-2fe03e3065c7';
const unit = 'Law';

const files = {
  orgs: 'organizations.jsonl',
  cont: 'contacts.jsonl',
  faces: 'interfaces.jsonl',
  creds: 'interface-credentials.jsonl'
};

const rfiles = {
  acquisitionsUnits: 'units.json',
  organizationTypes: 'organization-types.json',
  categories: 'categories.json'
};

try {
  if (!inFile) throw(`Usage: node culawOrgs.js <ref_dir> <organizations_csv_file>`);

  const dir = path.dirname(inFile);

  for (let f in files) {
    let fn = dir + '/' + files[f];
    if (fs.existsSync(fn)) {
      fs.unlinkSync(fn);
    }
    files[f] = fn;
  }

  const csv = fs.readFileSync(`${inFile}`, 'utf8');
  const inRecs = parse(csv, {
    columns: true,
    skip_empty_lines: true,
  });

  const ref = {};
  for (let f in rfiles) {
    let rfile = refDir + rfiles[f];
    let rdata = require(rfile);
    ref[f] = {};
    rdata[f].forEach(r => {
      let k = r.name || r.value;
      let v = r.id;
      ref[f][k] = v;
    });
  }
  // console.log(ref); return;
  let unitId = ref.acquisitionsUnits[unit];

  const writeTo = (fileName, data) => {
    let outStr = JSON.stringify(data) + '\n';
    fs.writeFileSync(fileName, outStr, { flag: 'a' });
  }

  const seen = {};
  let c = 0;
  let cc = 0;
  let ic = 0;
  let rc = 0;
  const orgRows = {};
  inRecs.forEach(r => {
    let oid = r['Code'];
    rc++;
    if (!seen[oid]) {
      let name = r['Millennium Vendor Name'];
      let desc = r.Description;
      let url = r['Organization Company URL'];
      let eta = r['Export to accounting'];
      let aliases = r.Aliases.split(/; /);
      let org = {
        id: uuid(oid, ns),
        code: oid,
        name: name,
        status: r.Status, 
        acqUnitIds: [unitId],
        isVendor: true,
      }
      org.exportToAccounting = (eta === 'yes') ? true : false;
      if (url) {
        if (!url.match(/^(http|ftp)/)) {
          url = 'https://' + url;
        }
        org.urls = [{ value: url }];
      }
      if (aliases[0]) {
        org.aliases = [];
        aliases.forEach(a => {
          org.aliases.push({value: a});
        });
      }
      if (desc) org.description = desc;
      writeTo(files.orgs, org);
      c++;
      seen[oid] = 1;
    } else {
      console.log('WARN Duplicate code', oid);
    }
  });

  console.log('Finished!');
  console.log('Organizations: ', c);
  console.log('Contacts: ', cc);
  console.log('Interfaces: ', ic);
} catch (e) {
  console.log(e);
}
