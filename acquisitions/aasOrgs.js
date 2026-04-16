const xlsx = require('xlsx');
const uuid = require('uuid/v5');
const fs = require('fs');

let refDir = process.argv[2];
let dir = process.argv[3];
const ns = 'a139be33-8e2b-44ec-b744-0f75207b57a5';

const files = {
  orgs: 'organizations.jsonl'
};

const rfiles = {
  organizationTypes: 'organization-types.json'
}


try {
  if (!dir) throw new Error('Usage: node aasOrgs.js <ref_dir> <dir_with_xlsx_files>');
  dir = dir.replace(/\/$/, '');
  refDir = refDir.replace(/\/$/, '');

  const fmatch = {
    addr: 'address',
    alt: 'alternate',
    main: 'quick',
    email: 'email',
    phone: 'phone'
  }
  const types = {};
  const data = {};

  for (let k in files) {
    let fn = dir + '/' + files[k];
    files[k] = fn;
    if (fs.existsSync(fn)) fs.unlinkSync(fn);
  }
  // console.log(files); return;

  const refData = {};
  for (let f in rfiles) {
    let rfile = refDir + '/' + rfiles[f];
    let rdata = require(rfile);
    refData[f] = {};
    rdata[f].forEach(r => {
      let k = (r.name) ? r.name.toLowerCase() : '';
      let c = r.code;
      let v = r.id;
      if (k && v) refData[f][k] = v;
      if (c && v) refData[f][c] = v;
    });
  }
  // console.log(refData); return;

  const writeTo = (fileName, data) => {
    let outStr = JSON.stringify(data) + '\n';
    fs.writeFileSync(fileName, outStr, { flag: 'a' });
  }

  let inFiles = fs.readdirSync(dir);
  inFiles.forEach(fn => {
    if (fn.match(/\.xlsx/)) {
      let path = dir + '/' + fn;
      for (let k in fmatch) {
        let m = fmatch[k];
        let r = new RegExp(m, 'i');
        if (fn.match(r)) types[k] = path;
      }
    }
  });

  for (let t in types) {
    let p = types[t];
    console.log(`INFO Parsing ${p}`);
    let ss = xlsx.readFile(p, { cellDates: true });
    let sn = ss.SheetNames[0];
    let sheet = ss.Sheets[sn];
    let recs = xlsx.utils.sheet_to_json(sheet);
    if (recs) {
      recs.forEach(r => {
        let id = r.VENDOR_ID;
        delete r.VENDOR_ID;
        if (!data[t]) data[t] = {};
        if (!data[t][id]) data[t][id] = [];
        data[t][id].push(r);
      })
    }

  }

  // map main sheet
  let ttl = { orgs: 0 };
  const seen = {};
  for (let id in data.main) {
    let r = data.main[id][0];
    if (process.env.DEBUG) console.log(r);
    let instId = r.INSTITUTION_ID.toLowerCase();
    let typeId = refData.organizationTypes[instId];
    let alt = data.alt[id];
    let addr = data.addr[id];
    let ph = data.phone[id];
    let o = {
      id: uuid(id, ns),
      name: r.VENDOR_NAME,
      code: r.VENDOR_CODE,
      status: 'Active',
      language: 'English',
      isVendor: true,
    }
    if (typeId) o.organizationTypes = [ typeId ];
    if (r.NOTE) o.description = r.NOTE;

    if (alt) {
      o.aliases = [];
      alt.forEach(d => {
        o.aliases.push({ value: d.ALT_VENDOR_NAME });
      });
    }

    if (addr) {
      o.addresses = [];
      addr.forEach(d => {
        let pr = (d.PAYMENT_ADDRESS === 'Y') ? true : false;
        
        let ao = {
          isPrimary: pr,
        };
        let adds = []
        for (let x = 1; x < 5; x++) {
          let k = `ADDRESS_LINE${x}`;
          if (d[k]) adds.push(d[k]);
        }
        ao.addressLine1 = adds.shift();
        if (adds[0]) ao.addressLine2 = adds.join(', ');
        if (d.CITY) ao.city = d.CITY;
        if (d.STATE_PROVINCE) ao.stateRegion = d.STATE_PROVINCE;
        if (d.ZIP_POSTAL) ao.zipCode = d.ZIP_POSTAL;
        if (d.COUNTRY) ao.country = d.COUNTRY;
        o.addresses.push(ao);
      });
    }

    if (ph) {
      o.phoneNumbers = [];
      ph.forEach(d => {
        let pr = (d.PHONE_DESC === 'Primary') ? true : false;
        let po = {
          isPrimary: pr
        };
        if (d.PHONE_NUMBER) po.phoneNumber = d.PHONE_NUMBER;
        po.type = (d.PHONE_DESC === 'Mobile') ? 'Mobile' : (d.PHONE_DESC === 'Fax') ? 'Fax' : 'Other';
        console.log(po);
      });
    }

    if (process.env.DEBUG) console.log(o);
    if (!seen[o.id] && !seen[o.code]) {
      writeTo(files.orgs, o);
      ttl.orgs++;
    }
  }

  console.log('Finished!')
  for (let k in ttl) {
    console.log(k, ':', ttl[k]);
  }
  
} catch (e) {
  console.error(e.message);
}
