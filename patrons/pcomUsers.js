const readline = require('readline');
const fs = require('fs');
const path = require('path');
const uuid = require('uuid/v5');
const { parse } = require('csv-parse/sync');

const ns = '3cbefeab-ae52-4c14-8c78-3ed70a827a18';
let refDir = process.argv[2];
let inFile = process.argv[3];

const files = {
  u: 'users',
  p: 'perms',
  r: 'request-prefs',
  e: 'errors'
};

const makeNote = (mesg, userId, noteTypeId) => {
  const note = {
    id: uuid(userId + mesg, ns),
    content: mesg,
    domain: 'users',
    title:  'Migrated Voyager Note',
    typeId: noteTypeId,
    popUpOnCheckOut: false,
    popUpOnUser: false,
    links: [
      {
        type: 'user',
        id: userId
      }
    ]
  }
  return note;
}

const writeOut = (fileName, data) => {
  let line = JSON.stringify(data) + "\n";
  fs.writeFileSync(fileName, line, { flag: 'a' });
}

try {
  if (!inFile) throw 'Usage: node pcomUsers.js <ref_dir> <users_csv_file>';
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
  // console.log(files); return;

  const refData = {};

  // map folio groups from file
  refData.usergroups = {};
  const groups = require(`${refDir}/groups.json`);
  groups.usergroups.forEach(g => {
    refData.usergroups[g.desc] = g.id;
    refData.usergroups[g.group] = g.id;
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

  const groupMap = {};
  const deptMap = {};
  let gfile = refDir + '/groups.tsv';
  let gdata = fs.readFileSync(gfile, { encoding: 'utf8' });
  gdata.split(/\n/).forEach(l => {
    let c = l.split(/\t/);
    let k = c[1].trim();
    let gv = c[2].trim();
    let dv = c[4].trim().toLowerCase();
    groupMap[k] = refData.usergroups[gv];
    deptMap[k] = refData.departments[dv];
  });
  
  // throw(groupMap);
  // throw(deptMap);


  let csv = fs.readFileSync(inFile, {encoding: 'utf8'});
  inRecs = parse(csv, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true
  })
  // throw(inRecs);

  const today = new Date().valueOf();
  let count = 0;
  let success = 0;
  let ncount = 0;
  let ecount = 0;
  const useen = {};

  for (let x = 0; x < inRecs.length; x++) {
    count++;
    let p = inRecs[x];
    if (process.env.DEBUG) console.log(p);
    for (let k in p) {
      p[k] = p[k].trim();
    }
    let ln = p.LAST_NAME
    let fn = p.FIRST_NAME;
    let mn = p.MIDDLE_NAME;
    let un = p.INSTITUTION_ID; 
    let id = un;
    let group = p.PATRON_GROUP_DISPLAY;
    let dept = p.PATRON_GROUP_DISPLAY;
    let edate = p.EXPIRE_DATE;
    let cdate = p.CREATE_DATE;
    let bdate = p.BIRTH_DATE;
    let bc = p.PATRON_BARCODE;
    let email = p.EMAIL_ADDRESS;
    let ph = p.PHONE_NUMBER;
    let add1 = p.ADDRESS_LINE1;
    let add2 = p.ADDRESS_LINE2;
    let city = p.CITY;
    let state = p.STATE_PROVINCE;
    let zip = p.ZIP_CODE;
    let groupId = groupMap[group];
    if (!useen[un]) {
      u = {
        id: uuid(id, ns),
        username: un,
        active: true,
        patronGroup: groupId,
        personal: {
          lastName: ln,
          firstName: fn,
          middleName: mn,
          addresses: []
        }
      };
      if (bc) u.barcode = bc;
      if (edate) {
        let val = new Date(edate).toISOString().substring(0, 10);
        u.expirationDate = val;
      }
      if (cdate) {
        let val = new Date(cdate).toISOString().substring(0, 10);
        u.enrollmentDate = val;
      }
      if (bdate) {
        let val = new Date(bdate).toISOString().substring(0, 10);
        u.personal.dateOfBirth = val;
      }
      if (email) u.personal.email = email;
      if (ph) u.personal.phone = ph;
      if (add1) {
        let primary = true;
        let a = {
          addressLine1: add1
        };
        if (add2) a.addressLine2 = add2;
        if (city) a.city = city;
        if (state) a.region = state;
        if (zip) a.postalCode = zip;
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
      let deptId = deptMap[dept];
      if (deptId) {
        u.departments = [ deptId ]; 
      }

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
        useen[un] = 1;
      } else {
        console.log(`ERROR No patronGroup found for ${group}`);
        ecount++;
      }
    } else {
      console.log(`ERROR username "${un}" already used!`)
      ecount++;
    }
  } 

  const t = (new Date().valueOf() - today) / 1000;
  console.log('------------');
  console.log('Finished!');
  console.log('Processed:', count);
  console.log('Users created:', success, '-->', files.u);
  console.log('Perms created:', success, '-->', files.p);
  console.log('Prefs created:', success, '-->', files.r);
  console.log('Errors:', ecount, '-->', files.e);
  console.log('Time (secs):', t);
} catch (e) {
  console.log(e);
}
