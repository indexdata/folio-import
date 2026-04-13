const fs = require('fs');
const uuid = require('uuid/v5');
const path = require('path');
const { parse } = require('csv-parse/sync');

let refDir = process.argv[2];
const inFile = process.argv[3];
const filter = process.argv[4];
const ns = '3c890077-0867-41e2-a357-d157f580096d';

const files = {
  orgs: 'organizations.jsonl',
  contacts: 'contacts.jsonl'
};

const rfiles = {
  organizationTypes: 'organization-types.json'
};

try {
  if (!inFile) throw(`Usage: node msmOrgs.js <ref_dir> <vendors_csv_file> [ <filter_field> ]`);

  const dir = path.dirname(inFile);
  refDir = refDir.replace(/\/$/, '');

  for (let f in files) {
    let fn = dir + '/' + files[f];
    if (fs.existsSync(fn)) {
      fs.unlinkSync(fn);
    }
    files[f] = fn;
  }
  // throw(files);

  const refData = {};
  for (let f in rfiles) {
    let rfile = refDir + '/' + rfiles[f];
    let rdata = require(rfile);
    refData[f] = {};
    rdata[f].forEach(r => {
      let k = r.name;
      let c = r.code;
      let v = r.id;
      if (k && v) refData[f][k] = v;
      if (c && v) refData[f][c] = v;
    });
  }
  // throw(refData);

  const writeTo = (fileName, data) => {
    let outStr = JSON.stringify(data) + '\n';
    fs.writeFileSync(fileName, outStr, { flag: 'a' });
  }

  const reqFields = (object, fieldList) => {
    let out = true;
    fieldList.forEach(k => {
      if (out === true && !object[k]) {
        out = false;
        console.log(`ERROR missing required field: "${k}"`);
      }
    
    });
    return out;
  }

  const csv = fs.readFileSync(`${inFile}`, 'utf8');
  const inRecs = parse(csv, {
    columns: true,
    skip_empty_lines: true,
    from: 1
  });
  // throw(inRecs); 

  const seen = {};
  const ttl = { count: 0, orgs: 0, contacts: 0, errs: 0 };
  for (let x = 0; x < inRecs.length; x++) {
    let r = inRecs[x];
    if (filter && !r[filter]) continue;
    ttl.count++;
    if (process.env.DEBUG) console.log(r);
    let addr = [];
    if (r.address1) addr.push(r.address1);
    if (r.address2) addr.push(r.address2);
    let desc = [];
    if (r.contact) desc.push(r.contact);
    if (r.acctNum) desc.push(r.acctNum);

    let o = {
      id: uuid(r.code, ns),
      name: r.vendorName,
      code: r.code,
      status: 'Active',
      isVendor: true,
      addresses: []
    };
    addr.forEach((a, el) => {
      if (a.match(/^http/)) { 
        o.urls = [ { value: a } ];
      } else {
        let l = a.split(/\$/);
        let ll = l.pop();
        let [ city, sz ] = ll.split(/, /);
        let [ state, zip] = (sz) ? sz.split(/ /) : ['', ''];
        let a2 = (l[1]) ? l.pop() : '';
        let a1 = l.join(', ');
        let ao = {
          addressLine1: a1,
          addressLine2: a2,
          city: city,
          stateRegion: state
        };
        if (zip.match(/\d{5}/)) { 
          ao.zipCode = zip;
        } else {
          ao.country = zip;
        }
        ao.isPrimary = (el === 0) ? true : false;
        o.addresses.push(ao);
      }
    });

    if (desc[0]) o.description = desc.join(/; /);

    if (r.acctNum) {
      let ac = { accountNo: r.acctNum, name: o.name, accountStatus: 'Active' };
      o.accounts = [ ac ];
    }

    if (r.phone) {
      let ph = { phoneNumber: r.phone, isPrimary: true };
      o.phoneNumbers = [ ph ];
    }

    if (r.email) {
      let em = { value: r.email, isPrimary: true };
      o.emails = [ em ];
    }
    if (!seen[o.code]) {
      if (process.env.DEBUG) console.log(o);
      writeTo(files.orgs, o);
      ttl.orgs++;
    } else {
      console.log(`ERROR vendor code "${o.code}" is already used!`);
      ttl.errs++;
    }
  }

  console.log('Finished!');
  for (let k in ttl) {
    console.log(`${k}: `, ttl[k]);
  }
} catch (e) {
  console.log(e);
}
