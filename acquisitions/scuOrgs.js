const parse = require('csv-parse/lib/sync');
const fs = require('fs');
const uuid = require('uuid/v5');
const path = require('path');
const { ADDRCONFIG } = require('dns');

let refDir = process.argv[2];
const inFile = process.argv[3];
const ns = '5a48a9be-708a-4906-b434-4ebf66a13408';
let unit = 'Univeristy Library';

const files = {
  orgs: 'organizations.jsonl',
  notes: 'notes.jsonl',
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
  if (!inFile) throw(`Usage: node scuOrgs.js <ref_dir> <organizations_csv_file>`);

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

  refDir = refDir.replace(/\/$/, '');
  const ref = {};
  for (let f in rfiles) {
    let rfile = refDir + '/' + rfiles[f];
    let rdata = require(rfile);
    ref[f] = {};
    rdata[f].forEach(r => {
      let k = r.name || r.value;
      let v = r.id;
      ref[f][k] = v;
    });
  }
  // console.log(ref); return;

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
      let name = r.Name;
      let url = r.urls;
      let orgStat = r['Organization Status'];
      let isVendor = (r['Is vendor'] === 'TRUE') ? true : false;
      let unit = r['Acquisition Unit'];
      let unitId = ref.acquisitionsUnits[unit];
      let erpCode = r['Accounting Code (erpCode)'];
      let pnum = r['phoneNumbers'];
      let email = r.emails;
      let add1 = r['Address 1'];
      let add2 = r['Address 2'];
      let city = r.City;
      let state = r['State/Province/Region'];
      let zip = r['Zip/Postal code'];
      let country = r.Country;
      let aname = r['Accounts-Name'];
      let anum = r['Accounts-Account Number'];
      let astat = r['Accounts-Account Status'];
      
      let org = {
        id: uuid(oid, ns),
        code: oid,
        name: name,
        status: orgStat, 
        acqUnitIds: [unitId],
        isVendor: isVendor,
      }

      if (erpCode) org.erpCode = erpCode;

      if (pnum) {
        org.phoneNumbers = [];
        let pnums = pnum.split(/; */);
        let primary = true;
        pnums.forEach(p => {
          let o = {
            phoneNumber: p,
            isPrimary: primary
          }
          org.phoneNumbers.push(o);
          primary = false;
        });
      }

      if (email) {
        org.emails = [];
        let emails = email.split(/; */);
        let primary = true;
        emails.forEach(v => {
          let o = {
            value: v,
            isPrimary: primary
          }
          org.emails.push(o);
          primary = false;
        });
      }

      if (url) {
        if (!url.match(/^(http|ftp)/)) {
          url = 'https://' + url;
        }
        org.urls = [{ value: url }];
      }

      if (add1) {
        let id = uuid(oid + add1, ns);
        let o = {
          id: id,
          addressLine1: add1,
          isPrimary: true
        }
        if (add2) o.addressLine2 = add2;
        if (city) o.city = city;
        if (state) o.stateRegion = state;
        if (zip) o.zipCode = zip;
        if (country) o.country = country;
        org.addresses = [ o ];
      }

      if (aname && anum && astat) {
        o = {
          name: aname,
          accountNo: anum,
          accountStatus: astat,
          acqUnitIds: [ unitId ]
        }
        org.accounts = [ o ];
      }

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
