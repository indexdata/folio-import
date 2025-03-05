const readline = require('readline');
const fs = require('fs');
const path = require('path');
const uuid = require('uuid/v5');
const { parse } = require('csv-parse/sync');

const ns = '9903d297-1cb6-44e4-897c-e1e45c58305f';
let refDir = process.argv[2];
let usrDir = process.argv[3]

const files = {
  u: 'users',
  p: 'perms',
  r: 'request-prefs',
  n: 'notes',
  e: 'errors'
};

const zfiles = {
  z303: 'main',
  z304: 'add',
  z305: 'loc',
  z308: 'id'
};

const groupMap = {
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
  if (!usrDir) throw 'Usage: node nls.js <ref_dir> <users_dir>';
  refDir = refDir.replace(/\/$/, '');
  usrDir = usrDir.replace(/\/$/, '');
  let base = 'users';

  for (let f in files) {
    let path = `${usrDir}/${base}-${files[f]}.jsonl`;
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
    let gnum = g.group.replace(/^(\d+).+/, '$1');
    refData.usergroups[gnum] = g.id;
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

  let main = [];
  let z = {};
  for (let f in zfiles) {
    let type = zfiles[f];
    let path = usrDir + '/' + f;
    let csv = fs.readFileSync(path, {encoding: 'utf8'});
    let zRecs = parse(csv, {
      columns: true,
      skip_empty_lines: true,
      delimiter: '\t',
      relax_column_count: true,
      trim: true
    });
    if (type === 'main') {
      main = zRecs;
    } else {
      z[type] = {};
      let kprop = (type === 'id') ? 'Z308_ID' : (type === 'add') ? 'Z304_REC_KEY' : 'Z305_REC_KEY'
      zRecs.forEach(r => {
        let k = r[kprop];
        if (k) {
          k = k.replace(/ .+$/, '');
        }
        if (type === 'id') {
          let rkey = r.Z308_REC_KEY;
          let idType = rkey.substring(0, 2);
          let data = rkey.replace(/^..([^ ]+).*/, '$1');
          if (!z[type][k]) z[type][k] = {};
          if (!z[type][k][idType]) z[type][k][idType] = [];
          z[type][k][idType].push(data); 
        } else {
          if (!z[type][k]) z[type][k] = [];
          z[type][k].push(r);
        }
      });
    }
  }
  // throw(JSON.stringify(z, null, 2));
  
  const today = new Date().valueOf();
  let count = 0;
  let success = 0;
  let ncount = 0;
  let ecount = 0;
  const nseen = {};
  const useen = {};

  for (let x = 0; x < main.length; x++) {
    count++;
    let p = main[x];
    if (process.env.DEBUG) console.log(p);
    let id = p.Z303_REC_KEY;
    let ads = z.add[id];
    let ids = z.id[id];
    let locs = z.loc[id];
    let name = p.Z303_NAME;
    let ln = name.replace(/,.+/, '');
    let fn = name.replace(/^.+?, */, '');
    let bc = (ids['01']) ? ids['01'][0] : '';
    let pid = (ids['03']) ? ids['03'][0] : '';
    let email = '';
    ads.forEach(r => {
      if (!email && r.Z304_EMAIL_ADDRESS) email = r.Z304_EMAIL_ADDRESS;
    });
    let un = email || bc || pid;
    let edate = p.EXPIRATION;
    let cdate = p.CREATED;

    let bcode = p.Z303_DELINQ_1;
    let borStat = (locs[0]) ? locs[0].Z305_BOR_STATUS : '';
    let gnum;
    if (borStat === '01' && bcode === '50') {
      gnum = '6';
    } else if (borStat === '4' && name.match(/personal/i)) {
      gnum = '3';
    } else if (borStat === '4' || borStat === '54') {
      gnum = '2';
    } else if (borStat === '20') {
      gnum = '4';
    } else if (borStat === '10' || borStat === '12') {
      gnum = '5'
    } else {
      gnum = '1';
    }
    let groupId = refData.usergroups[gnum];
    console.log(gnum, groupId);
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
