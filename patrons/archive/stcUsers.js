const readline = require('readline');
const fs = require('fs');
const path = require('path');
let uuid;
try {
  uuid = require('uuid/v5');
} catch (e) {
  const { v5 } = require('uuid');
  uuid = v5;
}
const { parse } = require('csv-parse/sync');

const ns = '3cbefeab-ae52-4c14-8c78-3ed70a827a18';
let refDir = process.argv[2];
let addFile = process.argv[3];
let noteFile = process.argv[4];
let inFile = process.argv[5];

const files = {
  u: 'users',
  p: 'perms',
  r: 'request-prefs',
  n: 'notes',
  e: 'errors'
};

const groupMap = {
  COMMUNITY: "Community",
  ADMIN: "Employee",
  AGENT: "Employee",
  CATALOG: "Employee",
  FACULTY: "Employee",
  STAFF: "Employee",
  ILL: "ILL",
  STUDENT: "Student",
  TEXSHARE:	"TexShare"
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
  if (!inFile) throw 'Usage: node stcUsers.js <ref_dir> <addresses_csv_file> <notes_csv_file> <users_csv_file>';
  if (!fs.existsSync(inFile)) throw `Can't find user file: ${inFile}!`;
  if (!fs.existsSync(addFile)) throw `Can't find address file: ${addFile}!`;
  if (!fs.existsSync(noteFile)) throw `Can't find note file: ${noteFile}!`;
  if (!fs.existsSync(refDir)) throw `Can't find ref data directory: ${refDir}!`;
  refDir = refDir.replace(/\/$/, '');
  let patronDir = path.dirname(inFile);
  let base = path.basename(inFile, '.txt', '.csv');

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
    refData.departments[d.name] = d.id;
  });
  // throw(refData);

  // map folio addresstypes from file
  const atypes = require(`${refDir}/addresstypes.json`);
  refData.addressTypes = {};
  atypes.addressTypes.forEach(a => {
    refData.addressTypes[a.addressType] = a.id;
  });
  // throw(refData);

  // map folio service-points from file
  const stypes = require(`${refDir}/service-points.json`);
  refData.servicepoints = {};
  stypes.servicepoints.forEach(a => {
    refData.servicepoints[a.name] = a.id;
  });
  // throw(refData.servicepoints);
  
  const ntypes = require(`${refDir}/note-types.json`);
  refData.noteTypes = {};
  ntypes.noteTypes.forEach(n => {
    refData.noteTypes[n.name] = n.id;
  });
  // throw(refData);

  for (let k in groupMap) {
    let v = groupMap[k];
    groupMap[k] = refData.usergroups[v];
  }
  // throw(groupMap);

  let csv = fs.readFileSync(inFile, {encoding: 'utf8'});
  inRecs = parse(csv, {
    columns: true,
    skip_empty_lines: true,
    delimiter: '|',
    relax_column_count: true
  })
  // console.log(inRecs); return;

  const addMap = {};
  const noteMap = {};
  const xfiles = [ addFile, noteFile ];
  xfiles.forEach(f => {
    let data = fs.readFileSync(f, { encoding: 'utf8' });
    data.split(/\n/).forEach(l => {
      l = l.replace(/&#124;./g, '');
      let [k, v] = l.split(/\|/);
      if (v && k) {
        let j = JSON.parse(v);
        if (f.match(/address/)) {
          addMap[k] = j;
        } else {
          noteMap[k] = j;
        }
      }
    });
  });
  // throw(JSON.stringify(noteMap, null, 2));
  
  const today = new Date().valueOf();
  let count = 0;
  let success = 0;
  let ncount = 0;
  let ecount = 0;
  const nseen = {};
  const useen = {};

  for (let x = 0; x < inRecs.length; x++) {
    count++;
    let p = inRecs[x];
    if (process.env.DEBUG) console.log(p);
    for (let k in p) {
      p[k] = p[k].trim();
    }
    let ln = p.LASTNAME;
    let fn = p.FIRSTNAME;
    let un = p.USERNAME; 
    let id = un;
    let group = p.PROFILE;
    let edate = p.EXPIRATION;
    let cdate = p.CREATED;
    let bc = p.BARCODE;
    let groupId = groupMap[group];
    let ad = addMap[un];
    let nt = noteMap[un];
    if (process.env.DEBUG) console.log(ad);
    if (process.env.DEBUG) console.log(nt);
    if (!useen[un]) {
      u = {
        id: uuid(id, ns),
        username: un,
        externalSystemId: un,
        active: true,
        patronGroup: groupId,
        personal: {
          lastName: ln,
          firstName: fn,
          addresses: []
        }
      };
      if (bc) u.barcode = bc;
      if (edate) {
        edate = edate.replace(/^(....)(..)(..)/, '$1-$2-$3');
        let val = new Date(edate).toISOString().substring(0, 10);
        u.expirationDate = val;
      }
      if (cdate) {
        cdate = cdate.replace(/^(....)(..)(..)/, '$1-$2-$3');
        let val = new Date(cdate).toISOString().substring(0, 10);
        u.enrollmentDate = val;
      }
      if (ad.EMAIL) u.personal.email = ad.EMAIL[0].D;
      if (ad.PHONE) {
        let ph = ad.PHONE[0].D
        if (!ph.match(/REQUIRED/)) u.personal.phone = ph;
      }
      
      if (ad.STREET) {
        let primary = true;
        let a = {
          addressLine1: ad.STREET[0].D
        };
        if (ad.LINE) a.addressLine2 = ad.LINE[0].D;
        if (ad.CITY_STATE) {
          let cs = ad.CITY_STATE[0].D.split(/, */);
          a.city = cs[0];
          a.region = cs[1];
        }
        if (ad.ZIP) a.postalCode = ad.ZIP[0].D;
        a.addressTypeId = refData.addressTypes.DEFAULT;
        a.primaryAddress = primary;
        u.personal.addresses.push(a);
        primary = false;
      }
      if (u.personal.email) {
        u.personal.preferredContactTypeId = '002'
      } else {
        u.personal.preferredContactTypeId = '001'
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
        if (nt) {
          nt.NOTE.forEach(n => {
            let o = {
              content: n.D,
              typeId: refData.noteTypes['Symphony Note'],
              domain: 'users',
              title: 'Symphony Note',
              popUpOnCheckOut: false,
              popUpOnUser: false,
              links: [
                { type: 'user', id: u.id }
              ]
            };
            writeOut(files.n, o);
            ncount++;
          });
        }
        let pref = {
          id: uuid(u.id + 'pref', ns),
          userId: u.id,
          holdShelf: true,
          delivery: false,
          defaultServicePointId: refData.servicepoints['Pecan Library']
        }
        writeOut(files.r, pref);
        useen[un] = 1;
      } else {
        console.log(`ERROR No patronGroup found for ${groupLabel}`);
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
  console.log('Notes created:', ncount, '-->', files.n);
  console.log('Errors:', ecount, '-->', files.e);
  console.log('Time (secs):', t);
} catch (e) {
  console.log(e);
}
