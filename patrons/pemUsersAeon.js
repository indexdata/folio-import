const readline = require('readline');
const fs = require('fs');
const path = require('path');
const uuid = require('uuid/v5');
const parse = require('csv-parse/lib/sync');

const ns = '053d693b-8474-44ff-b2e3-4c005f5d9ae1';
let refDir = process.argv[2];
let inFile = process.argv[3];

const files = {
  u: 'users',
  p: 'perms',
  r: 'rprefs',
  n: 'notes',
  e: 'errors'
};

const deptNames = {
  "Administration": "Administration",
  "Collections": "Collections",
  "Curatorial": "Curatorial",
  "Development": "Development",
  "Historic House": "Historic House",
  "Jacob Lawrence Fellow": "Jacob Lawrence Fellow",
  "Learning": "Learning",
  "Library": "Library",
  "Malamy Fellow": "Malamy Fellow",
  "Marketing": "Marketing",
  "Native American Fellow": "Native American Fellow",
  "Publishing": "Publishing",
  "Security": "Security",
  "Artist": "Artist",
  "Author": "Author",
  "Faculty": "Faculty",
  "Student": "Student",
  "Genealogical researcher": "Genealogy",
  "Independent researcher": "Independent ",
  "Museum staff": "Museum",
  "Other": "",
}

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
  if (!inFile) throw 'Usage: node pemUserAeons.js <ref_directory> <csv_file>';
  if (!fs.existsSync(inFile)) throw `Can't find patron file: ${inFile}!`;
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

  const groupMap = {};

  // map folio groups from file
  const groups = require(`${refDir}/groups.json`);
  groups.usergroups.forEach(g => {
    groupMap[g.desc] = g.id;
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

  let csv = fs.readFileSync(inFile, {encoding: 'utf8'});
  inRecs = parse(csv, {
    columns: true,
    skip_empty_lines: true
  })
  // console.log(inRecs); return;
  
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
    for (let k in p) {
      p[k] = p[k].trim();
    }
    // console.log(p);
    let ln = p.LastName;
    let fn = p.FirstName;
    let un = fn + ln;
    un = un.toLowerCase();
    let id = un;
    let dp = p['F Department name'];
    let edate = p.EXPIRE_DATE;
    let cdate = p['CreationDate (Year)'];
    if (!useen[un]) {
      u = {
        id: uuid(id, ns),
        username: un,
        active: true,
        personal: {
          lastName: ln,
          firstName: fn,
          addresses: []
        }
      };
      if (edate) {
        let val = new Date(edate).toISOString().substring(0, 10);
        u.expirationDate = val;
      }
      if (cdate) {
        let val = new Date(cdate).toISOString().substring(0, 10);
        u.enrollmentDate = val;
      }
      let depName = deptNames[dp] || dp;
      let dept = depMap[depName] || '';
      if (dept) u.departments = [  dept ];
      if (dp && !dept) console.log(`WARN department not found for ${dp}`);
      let groupLabel = p['F Patron Group Label'];
      u.patronGroup = groupMap[groupLabel];
      if (p.UserName.match(/@.+\./)) u.personal.email = p.UserName;
      if (p.Phone) u.personal.phone = p.Phone;
      
      if (p.Address) {
        let primary = true;
        let a = {
          addressLine1: p.Address
        };
        if (p.Address2) a.addressLine2 = p.Address2;
        a.city = p.City;
        a.region = p.State;
        a.postalCode = p.Zip;
        a.countryId = p.Country;
        a.addressTypeId = '93d3d88d-499b-45d0-9bc7-ac73c3a19880'; // Home
        a.primaryAddress = primary;
        u.personal.addresses.push(a);
        primary = false;
      }
      if (u.personal.email) {
        u.personal.preferredContactTypeId = '002'
      } else {
        u.personal.preferredContactTypeId = '001'
      }

      u.customFields = {
        cleared: (p.Cleared === 'Yes') ? true : false,
        newsletterOptIn: (p['Newsletter opt in'] === 'Yes') ? true : false,
      };
      let por = [];
      if (p['Purpose of research']) por.push(p['Purpose of research']);
      if (p['ResearchTopics']) por.push(p['ResearchTopics']);
      u.customFields.purposeOfResearch = por.join('; ');

      if (u.patronGroup) {
        writeOut(files.u, u);
        // console.log(u);
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
        console.log(`ERROR No patronGroup found for ${groupLabel}`);
        ecount++;
      }
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
  console.log('Errors:', ecount, '-->', files.e);
  console.log('Time (secs):', t);
} catch (e) {
  console.log(e);
}
