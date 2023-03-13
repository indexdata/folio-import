const parse = require('csv-parse/lib/sync');
const fs = require('fs');
const uuid = require('uuid/v5');
const path = require('path');

const refDir = process.argv[2];
const inFile = process.argv[3];
const ns = '2d0d02e9-5758-4d3b-8db7-fafa64cfd03e';
const unit = 'NECO Library';

const files = {
  orgs: 'organizations.jsonl',
  cont: 'contacts.jsonl'
};

const rfiles = {
  acquisitionsUnits: 'units.json',
  organizationTypes: 'organization-types.json',
  categories: 'categories.json'
};

try {
  if (!inFile) throw(`Usage: node necoOrgs.js <ref_dir> <organizations_csv_file>`);

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
    from: 2
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
  let unitId = ref.acquisitionsUnits['NECO Library'];

  const writeTo = (fileName, data) => {
    let outStr = JSON.stringify(data) + '\n';
    fs.writeFileSync(fileName, outStr, { flag: 'a' });
  }

  const seen = {};
  const orgRows = {};
  let c = 0;
  let cc = 0;
  inRecs.forEach(r => {
    let oid = r['Organization ID'];
    if (!orgRows[oid]) orgRows[oid] = [];
    orgRows[oid].push(r);
  });

  let cseen = {};
  let rseen = {}
  for (let oid in orgRows) {
    let rows = orgRows[oid];
    let tr = rows.length;
    let aseen = {};
    let rc = 0;
    let org = {};
    let contacts = {}
    rows.forEach(r => {
      rc++;
      for (let f in r) {
        r[f] = r[f].replace(/\\N/g, '');
      }
      if (!org.name) {
        let name = r['Organization Name'];
        let desca = r['Organization Account Details'];
        let descb = r['Organization Notes'];
        let url = r['Organization Company URL'];
        let role = r['Organization Role'];
        let typeId = ref.organizationTypes[role] || '';
        org = {
          id: uuid(oid, ns),
          code: oid,
          name: name,
          status: 'Active',
          acqUnitIds: [ unitId ],
          isVendor: false,
          aliases: [],
          contacts: []
        }
        if (url) {
          if (!url.match(/^(http|ftp)/)) {
            url = 'https://' + url;
          }
          org.urls = [ { value: url } ];
        }
        if (role === 'Vendor') org.isVendor = true;
        if (typeId) org.organizationTypes = [ typeId ];
        let desc = []
        if (desca) desc.push(desca);
        if (descb) desc.push(descb);
        if (desc[0]) org.description = desc.join('\n ');
      }
      let aliasName = r['Alias Name'];
      let aliasType = r['Alias Type'];
      let akey = aliasName + aliasType;
      if (aliasName && !aseen[akey]) {
        let obj = {};
        obj.value = aliasName;
        if (aliasType) obj.description = aliasType;
        org.aliases.push(obj);
        aseen[akey] = 1
      }
      let cname = r['Contact Name'];
      let crole = r['Contact Role'];
      let rollkey = cname + crole;
      if (cname && !cseen[cname]) {
        let names = cname.match(/(.+) (.+)/) || ['Unknown', cname];
        let fn = names[1];
        let ln = names[2];
        let note = r['Contact Title'];
        let obj = {};
        obj.id = uuid(cname, ns);
        obj.firstName = fn.trim();
        obj.lastName = (ln) ? ln.trim() : obj.firstName;
        obj.categories = [];
        if (note) obj.notes = note;
        cc++;
        cseen[cname] = obj;
      }
      if (cname && crole && !rseen[rollkey]) {
        let crollId = ref.categories[crole];
        if (crollId) {
          cseen[cname].categories.push(crollId);
          rseen[rollkey] = 1;
        }
      }
      if (cseen[cname]) {
        let cid = cseen[cname].id;
        if (!contacts[cid]) org.contacts.push(cid);
        contacts[cid] = 1
      }
      if (rc === tr) {
        writeTo(files.orgs, org);
        c++;
      } else {
        // console.log(`WARN Duplicate code "${oid}`);
      }
      seen[oid] = 1;
    });
  }
  for (let k in cseen) {
    writeTo(files.cont, cseen[k]);
  }

  console.log('Finished!');
  console.log('Organizations created:', c);
  console.log('Contacts created:', cc);
} catch (e) {
  console.log(e);
}
