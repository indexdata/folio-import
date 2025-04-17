const readline = require('readline');
const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');
let uuid;
try {
  uuid = require('uuid/v5');
} catch (e) {
  const { v5 } = require('uuid');
  uuid = v5;
}

const ns = '62ca10d7-4336-4c77-982e-0badfeb34db6';
let refDir = process.argv[2];
let inFile = process.argv[3];

const files = {
  u: 'users',
  p: 'perms',
  r: 'request-prefs',
  e: 'errors'
};

cmap = {
  "Belgium": "BE",
  "Canada": "CA",
  "Czech Republic": "CZ",
  "Denmark": "DK",
  "England": "GB",
  "France": "FR",
  "Germany": "DE",
  "Italy": "IT",
  "Japan": "JP",
  "Scotland": "GB",
  "Switzerland": "CH",
  "The Netherlands": "NL",
  "U.S.": "US",
  "UK": "GB",
  "US": "US",
  "USA": "US",
  "United Kingdom": "GB",
  "United States of America": "US",
  "United States": "US"
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
  if (!inFile) throw 'Usage: node grolUsers.js <ref_dir> <users_csv_file>';
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

  // throw(groupMap);
  // throw(deptMap);


  let csv = fs.readFileSync(inFile, {encoding: 'utf8'});
  inRecs = parse(csv, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
    quote: '"'
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
    let uid = p['Membership Number'];
    let ln = p['Last Name'];
    let fn = p['First Name'];
    let un = p.Username; 
    let group = 'member';
    let dept = '';
    let edate = p['Membership Expires'];
    let cdate = '';
    let bdate = '';
    let bc = uid;
    let email = p['Primary Email Address'];
    let ph = p['Home Phone'];
    let ct = p.Country;
    let ccode = cmap[ct];
    let add1 = p.Street;
    let add2 = '';
    let city = p.City;
    let state = p.State;
    let zip = p.Zip;
    let int1 = p['Personal Bibliophile Interests'];
    let int2 = p['Professional Bibliophile Interests'];
    let intr = [];
    if (int1) intr.push(int1);
    if (int2) intr.push(int2);
    let groupId = refData.usergroups.Member;
    if (!groupId) {
      groupId = refData.usergroups.Unmapped;
      console.log(`WARN patron group not found for "${group}", using "Unmapped" (username: ${un}).`)
    }
    if (!useen[uid]) {
      u = {
        id: uuid(uid, ns),
        username: un,
        active: true,
        patronGroup: groupId,
        personal: {
          lastName: ln,
          firstName: fn,
          addresses: []
        }
      };
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
      if (cdate) {
        try {
          let val = new Date(cdate).toISOString().substring(0, 10);
          u.enrollmentDate = val;
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

      if (intr[0]) {
        let istr = intr.join('; ');
        u.customFields = { researchcollectingInterests: istr };
      }

      // console.log(JSON.stringify(u, null, 2));
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
        useen[uid] = 1;
      } else {
        console.log(`ERROR No patronGroup found for ${group} (username: ${un})`);
        ecount++;
      }
    } else {
      console.log(`ERROR membership id "${un}" already used!`)
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
