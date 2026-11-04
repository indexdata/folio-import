const readline = require('readline');
const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');
const { ref } = require('process');
let uuid;
try {
  uuid = require('uuid/v5');
} catch (e) {
  const { v5 } = require('uuid');
  uuid = v5;
}

const ns = '222311db-a940-48ea-a777-93f409f7fe39';
let refDir = process.argv[2];
let inFile = process.argv[3];

const files = {
  u: 'users',
  p: 'perms',
  r: 'request-prefs',
  n: 'notes',
  e: 'errors'
};

const ntMap = {
  Project: 'Project',
  Notes: 'Additional Notes',
  VoyagerNotes: 'Additional Notes',
  Topic: 'Topic',
  OtherEmails: 'Additional Contact Information',
  OtherPermAddresses: 'Additional Contact Information',
  'Other Phones': 'Additional Contact Information',
}

const makeNote = (mesg, userId, noteTypeId, popCo, popUser, ltype) => {
  const note = {
    id: uuid(userId + mesg, ns),
    content: mesg,
    domain: 'users',
    title:  'Migrated note',
    typeId: noteTypeId,
    popUpOnCheckOut: popCo,
    popUpOnUser: popUser,
    links: [
      {
        type: 'user',
        id: userId
      }
    ]
  }
  if (ltype) note.title += ` (${ltype})`;
  return note;
}

const writeOut = (fileName, data) => {
  let line = JSON.stringify(data) + "\n";
  fs.writeFileSync(fileName, line, { flag: 'a' });
}

try {
  if (!inFile) throw 'Usage: node morganUsers.js <ref_dir> <users_csv_file>';
  if (!fs.existsSync(inFile)) throw `Can't find user file: ${inFile}!`;
  if (!fs.existsSync(refDir)) throw `Can't find ref data directory: ${refDir}!`;
  refDir = refDir.replace(/\/$/, '');
  let patronDir = path.dirname(inFile);
  let base = path.basename(inFile, '.csv');

  for (let f in files) {
    let path = `${patronDir}/${base}-${files[f]}.jsonl`;
    if (fs.existsSync(path)) fs.unlinkSync(path);
    files[f] = path;
  }
  // throw(files);

  const refData = {};

  // map folio groups from file
  refData.usergroups = {};
  const groups = require(`${refDir}/groups.json`);
  groups.usergroups.forEach(g => {
    refData.usergroups[g.desc] = g.id;
    refData.usergroups[g.group] = g.id;
    let n = g.group;
  });
  // throw(refData);

  // map departments
  refData.departments = {};
  const deps = require(`${refDir}/departments.json`);
  deps.departments.forEach(d => {
    d.name = d.name.toLowerCase();
    refData.departments[d.name] = d.id;
  });
  // throw(refData);

  const atypes = require(`${refDir}/addresstypes.json`);
  refData.addressTypes = {};
  atypes.addressTypes.forEach(a => {
    refData.addressTypes[a.addressType] = a.id;
  });
  // throw(refData);

  const sps = require(`${refDir}/service-points.json`);
  refData.servicepoints = {};
  sps.servicepoints.forEach(a => {
    refData.servicepoints[a.name] = a.id;
  });
  // throw(refData);
  
  const ntypes = require(`${refDir}/note-types.json`);
  refData.noteTypes = {};
  ntypes.noteTypes.forEach(n => {
    refData.noteTypes[n.name] = n.id;
  });
  // throw(refData);

  for (let k in ntMap) {
    let ntype = ntMap[k];
    ntMap[k] = refData.noteTypes[ntype];
  }
  // throw(ntMap);
  
  const cfields = require(`${refDir}/custom-fields.json`);
  cmap = {};
  cfields.customFields.forEach(n => {
    cmap[n.name] = n.refId;
  });
  // throw(cmap);

  let csv = fs.readFileSync(inFile, {encoding: 'utf8'});
  inRecs = parse(csv, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
    quote: '"',
    bom: true
  })
  // throw(inRecs);

  const today = new Date().valueOf();
  let count = 0;
  let success = 0;
  let ncount = 0;
  let ecount = 0;
  const useen = {};
  const bcseen = {};

  for (let x = 0; x < inRecs.length; x++) {
    count++;
    let p = inRecs[x];
    if (process.env.DEBUG) console.log(p);
    for (let k in p) {
      p[k] = p[k].trim();
    }
    let uid = p['PatronID'];
    let ln = p['LastName'];
    let fn = p['FirstName'];
    let mn = p['MiddleName'];
    let ext = p.InstitutionID;
    let group = p.PatronGroup;
    let groupId = refData.usergroups[group] || refData.usergroups.Staff;
    let dept = '';
    let edate = p.ExpireDate;
    let cdate = p['CREATED'];
    let bdate = '';
    let bc = p.PatronBarcode;
    let email = p.Email;
    let un = '';
    let ph = p.Phone;
    let mp = p.MobilePhone;
    let add1 = p.PermAddress1;
    let add2 = p.PermAddress2;
    let city = p.PermAddressCity;
    let state = p.PermAddressState;
    let zip = p.PermAddressZip;
    let ccode = p.PermAddressCountry;
    if (!useen[uid]) {
      u = {
        id: uuid(uid, ns),
        active: true,
        patronGroup: groupId,
        personal: {
          lastName: ln,
          firstName: fn,
          middleName: mn,
          addresses: []
        },
        customFields: {}
      };
      if (un) u.username = un;
      if (ext) u.externalSystemId = ext;
      // if (uid) u.customFields[cmap['Legacy Record Number']] = uid;
      if (cdate) {
        try {
          let dstr = new Date(cdate).toISOString().substring(0, 10);
          u.customFields[cmap['Legacy Creation Date']] = dstr;
        } catch (e) {
          console.log('${e}');
        }
      }
      if (bc && !bcseen[bc]) {
        u.barcode = bc;
        bcseen[bc] = u.id;
      } else if (bc) {
        console.log(`WARN barcode "${bc}" already used by ${bcseen[bc]}`);
      }
      if (edate) {
        try {
          let val = new Date(edate).toISOString().substring(0, 10);
          u.expirationDate = val;
        } catch (e) {
          console.log(`WARN ${e} (username: ${un})`);
        }
      }
      if (bdate) {
        try {
          let val = new Date(bdate).toISOString().substring(0, 10);
          u.personal.dateOfBirth = val;
        } catch (e) {
          console.log(`WARN ${e} (username: ${un})`);
        }
      }
      if (email) u.personal.email = email;
      if (ph) u.personal.phone = ph;
      if (mp) u.personal.mobilePhone = mp;
      if (add1) {
        let primary = true;
        let a = {
          addressLine1: add1
        };
        if (add2) a.addressLine2 = add2;
        if (city) a.city = city;
        if (state) a.region = state;
        if (zip) a.postalCode = zip;
        if (ccode) a.countryId = ccode;
        a.addressTypeId = refData.addressTypes.Home;
        a.primaryAddress = primary;
        u.personal.addresses.push(a);
        primary = false;
      }
      if (u.personal.email) {
        u.personal.preferredContactTypeId = '002'
      } else {
        u.personal.preferredContactTypeId = '001'
      }
      if (process.env.DEBUG) console.log(JSON.stringify(u, null, 2));
      if (u.patronGroup) {
        writeOut(files.u, u);
        if (process.env.DEBUG) console.log(JSON.stringify(u, null, 2));
        success++
        let perm = {
          id: uuid(u.id, ns),
          userId: u.id,
          permissions: []
        }
        writeOut(files.p, perm);
        let pref = {
          id: uuid(u.id + 'pref', ns),
          userId: u.id,
          holdShelf: true,
          delivery: false,
          defaultServicePointId: refData.servicepoints['PA - Circulation Desk']
        }
        writeOut(files.r, pref);
        
        let comNotes = {};
        for (f in ntMap) { 
          let d = p[f];
          if (d) {
            let t = ntMap[f];
            if (!comNotes[t]) comNotes[t] = [];
            comNotes[t].push(d);
            
          }
        }
        for (let t in comNotes) {
          let d = comNotes[t].join('; ');
          let o = makeNote(d, u.id, t, false, false, '');
          writeOut(files.n, o);
          ncount++;
        }

        useen[uid] = 1;
      } else {
        console.log(`ERROR No patronGroup found for ${group} (username: ${un})`);
        writeOut(files.e, p);
        ecount++;
      }
    } else {
      console.log(`ERROR membership id "${un}" already used!`)
      writeOut(files.e, p);
      ecount++;
    }
  } 

  const t = (new Date().valueOf() - today) / 1000;
  console.log('------------');
  console.log('Finished!');
  console.log('Processed:', count);
  const stats = {
    users: success,
    perms: success,
    prefs: success,
    notes: ncount,
    errors: ecount,
    time: t
  };
  console.table(stats);
  /*
  console.log('Users created:', success, '-->', files.u);
  console.log('Perms created:', success, '-->', files.p);
  console.log('Prefs created:', success, '-->', files.r);
  console.log('Notes created:', ncount, '-->', files.n);
  console.log('Errors:', ecount, '-->', files.e);
  console.log('Time (secs):', t);
  */
} catch (e) {
  console.log(e);
}
