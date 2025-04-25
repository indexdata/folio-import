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

const ns = '07003236-c744-4fad-a7a5-72aa08636791';
let inFile = process.argv[2];
let tenFile = process.argv[3];

const groups = {
  staff: '3684a786-6671-4268-8ed0-9db82ebca60b'
};

const perm = 'reshare.user';
const authpath = '/bl-users/login';

const cmap = {
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
  if (!inFile) throw 'Usage: node troveUsers.js <users_csv_file> [ tenant_csv_file ]';
  if (!fs.existsSync(inFile)) throw `Can't find user file: ${inFile}!`;
  let patronDir = path.dirname(inFile);
  let loadDir = `${patronDir}/load`;
  fs.mkdirSync(loadDir, { recursive: true });

  let csv = fs.readFileSync(inFile, {encoding: 'utf8'});
  let inRecs = parse(csv, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
    quote: '"'
  })
  // throw(inRecs);

  const today = new Date().valueOf();
  let count = 0;
  let success = 0;
  let ecount = 0;
  let tcount = 0;
  const useen = {};
  const bcseen = {};
  let out = {};

  for (let x = 0; x < inRecs.length; x++) {
    count++;
    let p = inRecs[x];
    if (process.env.DEBUG) console.log(p);
    for (let k in p) {
      p[k] = p[k].trim();
    }
    let ten = p['NUC/tenant'].toLowerCase();
    let uid = p.Username;
    let un = uid; 
    let ln = p['Last Name'];
    let fn = p['First Name'];
    let group = p['Patron group'].toLowerCase();
    let edate = '';
    let email = p['Email address'];
    let ukey = ten + ':' + uid;
    let tenKey = ten.replace(/\W+/g, '_');
    if (!useen[ukey]) {
      u = {
        id: uuid(ukey, ns),
        username: un,
        externalSystemId: un,
        active: true,
        patronGroup: group,
        personal: {
          lastName: ln,
          firstName: fn,
        }
      };
      if (edate) {
        try {
          let val = new Date(edate).toISOString().substring(0, 10);
          u.expirationDate = val;
        } catch (e) {
          console.log(`WARN ${e} (username: ${un})`);
        }
      }
      if (email) {
        u.personal.email = email;
        u.personal.preferredContactTypeId = '002';
      }

      if (u.patronGroup) {
        if (!out[tenKey]) out[tenKey] = { users: [] };
        out[tenKey].users.push(u);
        // writeOut(files.u, u);
        if (process.env.DEBUG) console.log(JSON.stringify(u, null, 2));
        success++
        useen[ukey] = 1;
      } else {
        console.log(`ERROR No patronGroup found for ${group} (username: ${un})`);
        ecount++;
      }
    } else {
      console.log(`ERROR membership id "${un}" already used!`)
      ecount++;
    }
  } 

  const tns = {};
  if (tenFile) {
    let csv = fs.readFileSync(tenFile, {encoding: 'utf8'});
    let inRecs = parse(csv, {
      columns: true,
      skip_empty_lines: true,
      relax_column_count: true,
      quote: '"'
    })
    // throw(inRecs);
    inRecs.forEach(r => {
      let t = r.tenant;
      let u = r.username;
      let p = r.password;
      let url = (r.url) ? r.url.replace(/\.au\.reshare/, '-okapi.au.reshare') : ''; 
      if (url && p && u && t) {
        let o = {
          okapi: url,
          authpath: authpath,
          tenant: t,
          username: u,
          password: p,
          logpath: ''
        };
        tns[t] = o;
        tcount++;
      }
    });
  }
  // console.log(tns);

  // console.log(JSON.stringify(out, null, 2));
  for (let k in out) {
    let dirPath = `${loadDir}/${k}`;
    fs.mkdirSync(dirPath, { recursive: true });
    let fn = `${dirPath}/users-import.json`;
    out[k].totalRecords = out[k].users.length;
    let outStr = JSON.stringify(out[k], null, 1);
    fs.writeFileSync(fn, outStr);

    let ufn = `${dirPath}/users.jsonl`;
    let pfn = `${dirPath}/perms.jsonl`;
    if (fs.existsSync(ufn)) fs.unlinkSync(ufn);
    if (fs.existsSync(pfn)) fs.unlinkSync(pfn);
    out[k].users.forEach(u => {
      u.patronGroup = groups.staff;
      writeOut(ufn, u);
      let p = {
        id: uuid(u.id, ns),
        userId: u.id,
        permissions: [ perm ]
      };
      writeOut(pfn, p);
    });

    if (tenFile) {
      let t = tns[k];
      let cfn = `${dirPath}/config.json`;
      if (t) {
        fs.writeFileSync(cfn, JSON.stringify(t, null, 2) + '\n');
      }
    }
  }

  const t = (new Date().valueOf() - today) / 1000;
  console.log('------------');
  console.log('Finished!');
  console.log('Processed:', count);
  console.log('Users created:', success);
  console.log('Configs:', tcount);
  console.log('Errors:', ecount);
  console.log('Time (secs):', t);
} catch (e) {
  console.log(e);
}
