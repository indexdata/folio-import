const readline = require('readline');
const fs = require('fs');
const path = require('path');
const uuid = require('uuid/v5');
const parse = require('csv-parse/lib/sync');

const ns = '053d693b-8474-44ff-b2e3-4c005f5d9ae1';
let refDir = process.argv[2];
let patronDir = process.argv[3];

const files = {
  u: 'users',
  p: 'perms',
  r: 'rprefs',
  n: 'notes',
  e: 'errors'
};

const csvFiles = {
  pat: 'PATRON',
  add: 'PATRON_ADDRESS',
  bar: 'PATRON_BARCODE',
  not: 'PATRON_NOTES',
  pho: 'PATRON_PHONE'
};

const makeNote = (mesg, userId, noteTypeId) => {
  const note = {
    id: uuid(userId + mesg, ns),
    content: mesg,
    domain: 'users',
    title:  'Migrated Voyager Note',
    typeId: noteTypeId,
    popUpOnCheckOut: true,
    popUpOnUser: true,
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
  if (!patronDir) throw 'Usage: node pemUsers.js <ref_directory> <dir_with_csv_files>';
  if (!fs.existsSync(patronDir)) throw `Can't find patron file: ${patronDir}!`;
  if (!fs.existsSync(refDir)) throw `Can't find ref data directory: ${refDir}!`;
  patronDir = patronDir.replace(/\/$/, '');
  refDir = refDir.replace(/\/$/, '');

  for (let f in files) {
    let path = patronDir + '/user-' + files[f] + '.jsonl';
    if (fs.existsSync(path)) fs.unlinkSync(path);
    files[f] = path;
  }
  // console.log(files); return;

  const groupMap = {};

  // map folio groups from file
  const groups = require(`${refDir}/groups.json`);
  groups.usergroups.forEach(g => {
    groupMap[g.group] = g.id;
  });
  // console.log(groupMap); return;

  // map departments
  const depMap = {};
  const deps = require(`${refDir}/departments.json`);
  deps.departments.forEach(d => {
    depMap[d.name] = d.id;
  });
  // console.log(depMap); return;

  // tsv file
  const legacy = {};
  let tsv = fs.readFileSync(`${refDir}/groups.tsv`, { encoding: 'utf8' });
  legacy.groups = {};
  let tlines = tsv.split(/\n/);
  tlines.shift();
  tlines.forEach(l => {
    if (l) {
      let c = l.split(/\t/);
      let vcode = c[0].trim();
      let fcode = (c[2]) ? c[2].trim() : '';
      if (vcode && groupMap[fcode]) {
        legacy.groups[vcode] = groupMap[fcode];
      } else if (vcode) {
        console.log(`WARN patron group "${vcode}" not found...`);
      }
    }
  });
  // console.log(legacy); return;

  // map folio addresstyes from file
  const atypes = require(`${refDir}/addresstypes.json`);
  let atypeMap = {};
  atypes.addressTypes.forEach(a => {
    atypeMap[a.addressType] = a.id;
  });
  // console.log(atypeMap); return;

  const ntypes = require(`${refDir}/note-types.json`);
  let ntypeMap = {};
  ntypes.noteTypes.forEach(n => {
    ntypeMap[n.name] = n.id;
  });
  const noteType = 'General note';
  let noteTypeId = ntypeMap[noteType];
  if (!noteTypeId) throw(`Note type ID for "${noteType}" not found!`);
  // console.log(ntypeMap); return;

  const data = {};
  for (let f in csvFiles) {
    let path = patronDir + '/' + csvFiles[f] + '.csv';
    let csv = fs.readFileSync(path, {encoding: 'utf8'});
    data[f] = parse(csv, {
      columns: true,
      skip_empty_lines: true
    })
  }
  // console.log(data.add); return;
  
  const addMap = {}
  data.add.forEach(r => {
    let k = r.PATRON_ID;
    if (!addMap[k]) addMap[k] = [];
    addMap[k].push(r);
  });
  delete data.add;
  // console.log(addMap); return;

  const phoMap = {}
  data.pho.forEach(r => {
    let k = r.ADDRESS_ID;
    if (!phoMap[k]) phoMap[k] = [];
    phoMap[k].push(r);
  });
  delete data.pho;
  // console.log(phoMap); return;

  const barMap = {}
  data.bar.forEach(r => {
    let k = r.PATRON_ID;
    if (!barMap[k]) barMap[k] = [];
    barMap[k].push(r);
  });
  delete data.bar;
  // console.log(barMap); return;

  const notMap = {}
  data.not.forEach(r => {
    let k = r.PATRON_ID;
    if (!notMap[k]) notMap[k] = [];
    notMap[k].push(r);
  });
  delete data.not;
  // console.log(notMap); return;


  const today = new Date().valueOf();
  let count = 0;
  let success = 0;
  let ncount = 0;
  let ecount = 0;
  const nseen = {};
  const useen = {};

  for (let x = 0; x < data.pat.length; x++) {
    count++;
    let p = data.pat[x];
    let id = p.PATRON_ID;
    let ln = p.LAST_NAME;
    let fn = p.FIRST_NAME;
    let mn = p.MIDDLE_NAME;
    let un = fn + ln;
    un = un.toLowerCase();
    let dp = p.DEPARTMENT;
    let edate = p.EXPIRE_DATE;
    if (!useen[un]) {
      u = {
        id: uuid(id, ns),
        username: un,
        active: true,
        personal: {
          lastName: ln,
          firstName: fn,
          middleName: mn,
          addresses: []
        }
      };
      if (edate) {
        let val = new Date(edate).toISOString().substring(0, 10);
        u.expirationDate = val;
      }
      let dept = depMap[dp];
      if (dept) u.departments = [ dept ];
      if (dp && !dept) console.log(`WARN department not found for ${dp}`);
      let b = barMap[id];
      if (b && b[0].PATRON_GROUP_ID) {
        u.patronGroup = legacy.groups[b.PATRON_GROUP_ID];
      }
      if (b && b[0].PATRON_BARCODE) {
        u.barcode = b[0].PATRON_BARCODE;
      } else {
        u.barcode = id.padStart(8, '0');
      }
      let a = addMap[id];
      if (a) {
        a.forEach(r => {
          let adds = [];
          aid = r.ADDRESS_ID;
          if (r.ADDRESS_LINE2) adds.push(r.ADDRESS_LINE2);
          if (r.ADDRESS_LINE3) adds.push(r.ADDRESS_LINE3);
          if (r.ADDRESS_LINE4) adds.push(r.ADDRESS_LINE4);
          if (r.ADDRESS_TYPE === '3' && r.ADDRESS_LINE1) {
            u.personal.email = r.ADDRESS_LINE1;
          } else if (r.ADDRESS_LINE1) {
            let a = {
              id: uuid(aid, ns)
            };
            a.addressLine1 = r.ADDRESS_LINE1;
            if (adds[0]) {
              a.addressLine2 = adds.join(', ');
            }
            a.city = r.CITY;
            a.region = r.STATE_PROVINCE;
            a.postalCode = r.ZIP_POSTAL;
            a.country = r.COUNTRY;
            a.addressTypeId = '93d3d88d-499b-45d0-9bc7-ac73c3a19880'; // Home
            u.personal.addresses.push(a);
          }
          let p = phoMap[aid];
          if (p) {
            p.forEach(r =>{
              let pn = r.PHONE_NUMBER;
              if (pn && r.PHONE_TYPE === '1') u.personal.phone = pn;
            });
          }
          if (u.personal.email) {
            u.personal.preferredContactTypeId = '002'
          } else {
            u.personal.preferredContactTypeId = '001'
          }
        });
      }
      let n = notMap[id];
      if (n) {
        n.forEach(r => {
          let note = makeNote(r.NOTE, u.id, noteTypeId);
          if (! nseen[note.id]) {
            writeOut(files.n, note);
            nseen[note.id] = 1
            ncount++;
          } else {
            console.log(`WARN duplicate note found for user ${id} "${r.NOTE}"`)
          }
        });
      }
      writeOut(files.u, u);
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
        defaultServicePointId: '3a40852d-49fd-4df2-a1f9-6e2641a6e91f'
      }
      writeOut(files.r, pref);
      useen[un] = 1;
    } else {
      console.log(`ERROR username ${un} already used!`)
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
  console.log('Rejects:', ecount, '-->', files.e);
  console.log('Time (secs):', t);
} catch (e) {
  console.log(e);
}
