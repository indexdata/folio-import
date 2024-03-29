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
  let ic = 0;
  inRecs.forEach(r => {
    let oid = r['Organization ID'];
    if (!orgRows[oid]) orgRows[oid] = [];
    orgRows[oid].push(r);
  });

  let cseen = {};
  let rseen = {};
  let iseen = {};
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
        org = {
          id: uuid(oid, ns),
          code: oid,
          name: name,
          status: 'Active',
          acqUnitIds: [ unitId ],
          isVendor: false,
          aliases: [],
          contacts: [],
          interfaces: [],
          organizationTypes: []
        }
        if (url) {
          if (!url.match(/^(http|ftp)/)) {
            url = 'https://' + url;
          }
          org.urls = [ { value: url } ];
        }
        let desc = []
        if (desca) desc.push(desca);
        if (descb) desc.push(descb);
        if (desc[0]) org.description = desc.join('\n ');
      }
      let role = r['Organization Role'];
      if (role === 'Vendor') org.isVendor = true;
      let typeId = ref.organizationTypes[role] || '';
      if (typeId && org.organizationTypes.indexOf(typeId) === -1 ) org.organizationTypes.push(typeId);
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
      let phone = r['Contact Phone'];
      let altPhone = r['Contact Alt Phone'];
      let email = r['Contact Email'];
      let cadd = r['Contact Address'];
      let cnote = r['Contact Notes'];
      let notes = [];
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
        if (phone) { 
          obj.phoneNumbers = [{ phoneNumber: phone, isPrimary: true }];
          if (altPhone) {
            obj.phoneNumbers.push({ phoneNumber: altPhone, isPrimary: false });
          }
        }
        if (email && email.match(/@/)) {
          obj.emails = [{ value: email, isPrimary: true }];
        }
        if (cadd) {
          obj.addresses = [{ addressLine1: cadd }];
        }
        if (note) notes.push('Contact title: ' + note);
        if (cnote) notes.push('Contact note: ' + cnote);
        if (notes[0]) obj.notes = notes.join('; ');
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
      let alogin = r['Accounts Login Type'];
      let aurl = r['Accounts URL'];
      let amail = r['Accounts Local Account Email'];
      let auser = r['Accounts Username'];
      let apass = r['Accounts Password'];
      let anote = r['Accounts Notes'];
      let users = [];
      if (amail) users.push(amail);
      if (auser) users.push(auser)
      let ikey = alogin + aurl + auser;
      if (ikey && !iseen[ikey]) {
        let obj = {
          id: uuid(ikey, ns)
        }
        if (alogin) obj.type = [ alogin.replace(/Statistics/, 'Reports') ];
        if (aurl) obj.uri = aurl;
        if (users[0]) {
          cred = {
            id: uuid(obj.id + users[0], ns),
            interfaceId: obj.id
          };
          cred.username = users.join(', ');
          if (apass) cred.password = apass;
          writeTo(files.creds, cred);
        }
        if (anote) obj.notes = anote;
        writeTo(files.faces, obj);
        iseen[ikey] = obj;
        ic++;
      }
      if (iseen[ikey]) {
        let iid = iseen[ikey].id;
        if (org.interfaces.indexOf(iid) === -1) org.interfaces.push(iid);
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
  console.log('Organizations: ', c);
  console.log('Contacts: ', cc);
  console.log('Interfaces: ', ic);
} catch (e) {
  console.log(e);
}
