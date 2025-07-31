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

const ns = '9903d297-1cb6-44e4-897c-e1e45c58305f';
let refDir = process.argv[2];
let usrDir = process.argv[3]

const files = {
  u: 'users',
  p: 'perms',
  r: 'request-prefs',
  n: 'notes',
  b: 'blocks',
  e: 'errors'
};

const zfiles = {
  z303: 'main',
  z304: 'add',
  z305: 'loc',
  z308: 'id'
};

const shelfNum = (k) => {
  let out = '';
  if (k.match(/^[xyz{]/)) {
    out = 'D15';
  } else if (k.match(/^\|/)) {
    out = 'D16';
  } else if (k.match(/^i/)) {
    out = 'B11';
  } else if (k.match(/^q/)) {
    out = 'C14';
  } else if (k.match(/^u/)) {
    out = 'B11';
  }
  
  console.log(k, out);
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

const parseDate = (text) => {
  let out;
  if (text) {
    let dstr = text.replace(/(....)(..)(..)/, '$1-$2-$3');
    try {
      out = new Date(dstr).toISOString().replace(/T.+/, '');
    } catch (e) {
      console.log(`WARN "${dstr} is not proper date.`);
    }
  }
  return out;
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

  // map folio block templates from file
  const btypes = require(`${refDir}/manual-block-templates.json`);
  refData.manualBlockTemplates = {};
  btypes.manualBlockTemplates.forEach(a => {
    delete a.metadata;
    refData.manualBlockTemplates[a.name] = a;
    refData.manualBlockTemplates[a.code] = a;
  });
  // throw(refData.manualBlockTemplates);
  
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
          if (type === 'loc') k = k.substring(0, 12);
          if (!z[type][k]) z[type][k] = [];
          z[type][k].push(r);
        }
      });
    }
  }
  // throw(JSON.stringify(z.loc, null, 2));
  
  const today = new Date().valueOf();
  let count = 0;
  let success = 0;
  let bcount = 0;
  let ncount = 0;
  let ecount = 0;
  const nseen = {};
  const unseen = {};

  for (let x = 0; x < main.length; x++) {
    count++;
    let p = main[x];
    if (process.env.DEBUG) console.log(p);
    let nkey = p.Z303_NAME_KEY;
    // nkey = '{fdsf';
    let snum = shelfNum(nkey);
    let aid = p.Z303_PRIMARY_ID;
    let id = p.Z303_REC_KEY;
    let dels = [ p.Z303_DELINQ_1, p.Z303_DELINQ_2, p.Z303_DELINQ_3 ];
    let blockStaff = p.Z303_DELINQ_N_1
    let ads = z.add[id];
    let ids = z.id[id];
    let locs = z.loc[id] || [];
    let name = p.Z303_NAME.replace(/ \(.+$/, '');
    let ln = name.replace(/,.+/, '');
    let fn = (name.match(/,/)) ? name.replace(/^.+?, */, '') : '';
    let bc = (ids['01']) ? ids['01'][0] : '';
    let bcPre = id.replace(/\d+/, '');
    let pid = (ids['03']) ? ids['03'][0] : '';
    let email = '';
    if (ads) {
      ads.forEach(r => {
        if (!email && r.Z304_EMAIL_ADDRESS) email = r.Z304_EMAIL_ADDRESS;
      });
    }
    let un = email || '';

    let edate = '';
    locs.forEach(r => {
      edate = r.Z305_EXPIRY_DATE;
    });
    edate = parseDate(edate);
    let cdate = parseDate(p.Z303_OPEN_DATE);

    let bcodes = [ '', p.Z303_DELINQ_1, p.Z303_DELINQ_2, p.Z303_DELINQ_3 ];
    let borStat = (locs[0]) ? locs[0].Z305_BOR_STATUS : '';
    let gnum;
    let glab;
    if (bcodes[1] === '50' || bcodes[2] === '50' || bcodes[3] === '50') {
      gnum = '6';
      glab = 'Ny låntagare';
    } else if (borStat === '04' && name.match(/personal/i)) {
      gnum = '3';
      glab = 'Personal';
    } else if (borStat === '04' || borStat === '54') {
      gnum = '2';
      glab = 'Bokskåp';
    } else if (borStat === '20') {
      gnum = '4';
      glab = 'Funktion';
    } else if (borStat === '10' || borStat === '12') {
      gnum = '5';
      glab = 'Fjärrlånebibliotek';
    } else {
      gnum = '1';
      glab = 'Ordinarie';
    }
    let groupId = refData.usergroups[gnum] || refData.usergroups[glab];
    u = {
      id: uuid(id, ns),
      active: true,
      patronGroup: groupId,
      personal: {
        lastName: ln,
        firstName: fn,
      },
      customFields: {}
    };
    if (un && !unseen[un]) {
      u.username = un;
      unseen[un] = 1;
    } else if (unseen[un]) {
      console.log(`WARN username "${un}" already used.`);
    }
    if (bc) u.barcode = bc;
    if (u.barcode && bcPre && (borStat === '10' || borStat === '12')) u.barcode = bcPre + u.barcode;
    if (email) u.personal.email = email
    if (edate) u.expirationDate = edate;
    if (cdate) u.enrollmentDate = cdate;
    if (pid && borStat.match(/^(01|04|51|54|40)$/)) {
      let pidStr = pid.replace(/-/g, ''); 
      if (pidStr.length === 7) {
        pidStr = pidStr.substring(0, 6);
      }
      u.customFields.personnummer = pidStr;
    }
    if (id) {
      u.customFields.alephid = id;
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
      let pref = {
        id: uuid(u.id + 'pref', ns),
        userId: u.id,
        holdShelf: true,
        delivery: false,
        defaultServicePointId: refData.servicepoints['Pecan Library']
      }
      writeOut(files.r, pref);
      
      for (let x = 0; x < dels.length; x++) {
        d = dels[x];
        let t = refData.manualBlockTemplates[d];
        if (t) {
          let o = {
            id: uuid(t.id, u.id),
            type: 'manual',
            code: t.code,
            desc: t.blockTemplate.desc,
            patronMessage: t.blockTemplate.patronMessage,
            borrowing: t.blockTemplate.borrowing,
            renewals: t.blockTemplate.renewals,
            requests: t.blockTemplate.requests,
            userId: u.id
          }
          if (blockStaff) {
            o.staffInformation = blockStaff;
          }
          writeOut(files.b, o);
          bcount++;
        }
      }
    } else {
      console.log(`ERROR No patronGroup found for ${gnum}`);
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
  console.log('Blocks created:', bcount, '-->', files.b);
  console.log('Errors:', ecount, '-->', files.e);
  console.log('Time (secs):', t);
} catch (e) {
  console.log(e);
}
