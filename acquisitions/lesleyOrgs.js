const { parse } = require('csv-parse/sync');
const fs = require('fs');
const path = require('path');
let uuid;
try {
  uuid = require('uuid/v5');
} catch (e) {
  const { v5 } = require('uuid');
  uuid = v5;
}

let refDir = process.argv[2];
const inFile = process.argv[3];
const ns = '9eacd345-378d-4c3b-8b1d-2683d4a368ee';
const unit = '';

const files = {
  orgs: 'organizations.jsonl',
  cont: 'contacts.jsonl',
  faces: 'interfaces.jsonl',
  creds: 'interface-credentials.jsonl',
  notes: 'notes.jsonl'
};

const rfiles = {
  acquisitionsUnits: 'units.json',
  organizationTypes: 'organization-types.json',
  categories: 'categories.json',
  noteTypes: 'note-types.json'
};

try {
  if (!inFile) throw(`Usage: node lesleyOrgs.js <ref_dir> <organizations_csv_file>`);

  const writeTo = (fileName, data) => {
    let outStr = JSON.stringify(data) + '\n';
    fs.writeFileSync(fileName, outStr, { flag: 'a' });
  }

  const dir = path.dirname(inFile);
  const notesFile = dir + '/notes.csv';

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
  // throw(ref);

  for (let f in files) {
    let fn = dir + '/' + files[f];
    if (fs.existsSync(fn)) {
      fs.unlinkSync(fn);
    }
    files[f] = fn;
  }
  // throw(files);

  let csv = fs.readFileSync(notesFile, 'utf8');
  const notes = parse(csv, {
    columns: true,
    skip_empty_lines: true,
    delimiter: '|',
    'escape': '\\',
    from: 1
  });

  let nc = 0;
  notes.forEach(n => {
    let id = n['Organization ID'];
    let title = n['Note Title'];
    let note = n.Note;
    let type = n['Note Type'];
    let nkey = `${id}:${title}:${note}:${type}`;
    let nobj = {
      id: uuid(nkey, ns),
      title: title,
      content: note,
      domain: 'organizations',
      typeId: ref.noteTypes[type] || ref.noteTypes['General note'],
      links: [ {
        id: uuid(id, ns),
        type: 'organization'
      } ]
    }
    // console.log(nobj);
    writeTo(files.notes, nobj)
    nc++;
  });

  csv = fs.readFileSync(inFile, 'utf8');
  const inRecs = parse(csv, {
    columns: true,
    skip_empty_lines: true,
    delimiter: '|',
    'escape': '\\',
    from: 1
  });

  let unitId = ref.acquisitionsUnits[unit] || '';

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
  // throw(orgRows);

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
      // console.log(r);
      if (!org.name) {
        let name = r['Organization Name'];
        let desc = r['Organization Account Details'];
        let url = r['Organization Company URL'];
        org = {
          id: uuid(oid, ns),
          code: oid,
          name: name,
          status: 'Active',
          isVendor: true,
          aliases: [],
          contacts: [],
          interfaces: [],
          organizationTypes: [],
          urls: [],
        };
        if (url) {
          if (!url.match(/^(http|ftp)/)) {
            url = 'https://' + url;
          }
          if (org.urls.indexOf(url) === -1) org.urls.push({ value: url });
        }
        if (desc) org.description = desc;
      }
      let role = r['Organization Role'];
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
      let ckey = oid + cname;
      let crole = r['Contact Role'];
      let rollkey = ckey + crole;
      let phone = r['Contact Phone'];
      let fax = r['Contact Fax']
      let altPhone = r['Contact Alt Phone'];
      let email = r['Contact Email'];
      let cadd = r['Contact Address'];
      let cnote = r['Contact Notes'];
      let cstat = r['Contact Status'] || 'Y';
      let notes = [];
      if (cname && !cseen[ckey]) {
        cname = cname.trim(); 
        let names = cname.match(/(.+) (.+)/) || ['Unknown', cname];
        let fn = names[1];
        let ln = names[2];
        let note = r['Contact Title'];
        let clastup = r['Contact Updated Date'];
        let obj = {};
        obj.id = uuid(ckey, ns);
        obj.firstName = fn.trim();
        obj.lastName = (ln) ? ln.trim() : obj.firstName;
        // obj.inactive = (cstat && cstat === 'Y') ? false : true;
        obj.categories = [];
        if (phone) { 
          obj.phoneNumbers = [{ phoneNumber: phone, isPrimary: true }];
          if (altPhone) {
            obj.phoneNumbers.push({ phoneNumber: altPhone, isPrimary: false });
          }
        }
        if (fax) {
          if (!obj.phoneNumbers) obj.phoneNumbers = [];
          obj.phoneNumbers.push({ phoneNumber: fax, isPrimary: false });
        }
        if (email && email.match(/@/)) {
          obj.emails = [{ value: email, isPrimary: true }];
        }
        if (cadd) {
          obj.addresses = [{ addressLine1: cadd, isPrimary: true }];
        }
        if (note) notes.push('Contact title: ' + note);
        if (cnote) notes.push('Contact note: ' + cnote);
        // if (clastup) notes.push('Contact last update: ' + clastup);
        if (notes[0]) obj.notes = notes.join('; ');
        cc++;
        cseen[ckey] = obj;
      }
      if (cname && crole && !rseen[rollkey]) {
        let crollId = ref.categories[crole];
        if (crollId) {
          cseen[ckey].categories.push(crollId);
          rseen[rollkey] = 1;
        }
      }
      if (cseen[ckey]) {
        let cid = cseen[ckey].id;
        if (!contacts[cid]) org.contacts.push(cid);
        contacts[cid] = 1
      }
      let alogin = r['Accounts Login Type'];
      let aurl = r['Accounts URL'];
      let amail = r['Accounts Local Account Email'];
      let auser = r['Accounts Username'];
      let apass = r['Accounts Password'] || '[noPassword]';
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
          if (apass && cred.username) cred.password = apass;
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
        // console.log(org);
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
  console.log('Notes: ', nc);
} catch (e) {
  console.log(e);
}
