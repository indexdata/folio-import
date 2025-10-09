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

const nfields = [ 'Z303_FIELD_1', 'Z303_FIELD_2', 'Z303_FIELD_3', 'Z303_NOTE_1', 'Z303_NOTE_2' ];
const ntitle = 'Aleph user note';
const ntype = 'User note';

/**
 * Compute "hyllnr" code based on z302_name_key similar to the XSLT logic.
 * @param {string} key – z302‑name‑key string
 * @returns {string} – e.g. " (A2) "
 */
function hyllnr(key) {
  const z = key || "";
  const sb = translate(z.charAt(0),
    "yz{}",
    "xxx|");
  let code;
  switch (sb) {
    case "a": code = namnA(z); break;
    case "b": code = namnB(z); break;
    case "c": code = namnC(z); break;
    case "d": code = namnD(z); break;
    case "e": code = namnE(z); break;
    case "f": code = namnF(z); break;
    case "g": code = namnG(z); break;
    case "h": code = namnH(z); break;
    case "i": code = "B11"; break;
    case "j": code = namnJ(z); break;
    case "k": code = namnK(z); break;
    case "l": code = namnL(z); break;
    case "m": code = namnM(z); break;
    case "n": code = namnN(z); break;
    case "o": code = namnO(z); break;
    case "p": code = namnP(z); break;
    case "q": code = "C14"; break;
    case "r": code = namnR(z); break;
    case "s": code = namnS(z); break;
    case "t": code = namnT(z); break;
    case "u": code = "D10"; break;
    case "v":
    case "w": code = namnV(z); break;
    case "x": code = "D15"; break;
    case "|": code = "D16"; break;
    default: code = ""; break;
  }
  return code;
}

// JavaScript equivalent of XSLT translate() function: char-by-char mapping.
function translate(ch, fromChars, toChars) {
  const idx = fromChars.indexOf(ch);
  if (idx >= 0 && idx < toChars.length) return toChars[idx];
  if (idx >= 0 && idx >= toChars.length) return ""; // removed if no mapping
  return ch;
}

// Below: implementations of each "namnX" using translate of second/third and further logic.

function namnA(z) {
  const ab = translate(z.charAt(1),
    "mnpqrstuvwxyz{|}",
    "lloooooooooooooo");
  return ab === "l" ? "A2" : ab === "o" ? "A3" : "A1";
}

function namnB(z) {
  const ab = translate(z.charAt(1),
    "ghijklmnqrstuvwxyz{|}",
    "ffffffffppppppppppppp");
  if (ab === "e") {
    const tb = translate(z.charAt(2),
      "fghijklmnopqrstuvwxyz{|}",
      "eeeeeeeeeeeeeeeeeeeeeeee");
    return tb === "e" ? "A5" : "A4";
  }
  if (ab === "f") return "A6";
  if (ab === "o") return "A7";
  if (ab === "p") return "A8";
  return "A4";
}

function namnC(z) {
  const ab = translate(z.charAt(1),
    "ijklmnopqrstuvwxyz{|}",
    "hhhhhhhhhhhhhhhhhhhhh");
  return ab === "h" ? "A10" : "A9";
}

function namnD(z) {
  const ab = translate(z.charAt(1),
    "fghijklmnopqrstuvwxyz{|}",
    "eeeeeeeeeeeeeeeeeeeeeeee");
  return ab === "e" ? "A12" : "A11";
}

function namnE(z) {
  const ab = translate(z.charAt(1),
    "knopqrstuvwxyz{|}",
    "lmmmmmmmmmmmmmmmm");
  if (ab === "l") return "A14";
  if (ab === "m") return "A15";
  return "A13";
}

function namnF(z) {
  const ab = translate(z.charAt(1),
    "klmnopqstuvwxyz{|}",
    "jjjjjjjrrrrrrrrrrr");
  if (ab === "j") return "B2";
  if (ab === "r") return "B3";
  return "B1";
}

function namnG(z) {
  const ab = translate(z.charAt(1),
    "pqstuvwxz{|}",
    "rrrrryyyyyyy");
  if (ab === "r") return "B5";
  if (ab === "y") return "B6";
  return "B4";
}

function namnH(z) {
  const ab = translate(z.charAt(1),
    "fghjklmnoqrstuvwxyz{|}",
    "eeeiiiiiippppppppppppp");
  if (ab === "e") return "B8";
  if (ab === "i") return "B9";
  if (ab === "p") return "B10";
  return "B7";
}

function namnJ(z) {
  const ab = translate(z.charAt(1),
    "pqrstuvwxyz{|}",
    "oooooooooooooo");
  return ab === "o" ? "B12" : "B11";
}

function namnK(z) {
  const ab = translate(z.charAt(1),
    "ghijklmnoqrstuvwxyz{|}",
    "fffffffffppppppppppppp");
  if (ab === "f") return "B14";
  if (ab === "p") return "B15";
  return "B13";
}

function namnL(z) {
  const ab = translate(z.charAt(1),
    "fghkmnopqrstuwxyz{|}",
    "eeejlllllllllvvvvvvv");
  if (ab === "e") {
    const tb = translate(z.charAt(2),
      "pqrstuwxyz{|}",
      "oooooooooooooo");
    if (tb === "n") {
      const fb = translate(z.charAt(3),
        "fghijklmnopqrstuvwxyz{|}",
        "eeeeeeeeeeeeeeeeeeeee");
      if (fb === "d") {
        const fifth = translate(z.charAt(4),
          "hijklmnopqrstuvwxyz{|}",
          "gggggggggggggggggggggg");
        return fifth === "g" ? "C4" : "C3";
      }
      if (fb === "e") return "C4";
      return "C3";
    }
    if (tb === "o") return "C4";
    return "C2";
  }
  if (ab === "j") return "C4";
  if (ab === "l") return "C5";
  if (ab === "v") return "C6";
  return "C1";
}

function namnM(z) {
  const ab = translate(z.charAt(1),
    "fghijklmnopqrstuvwxyz{|}",
    "eeeeeeeeeeeeeeeeeeeeeeee");
  return ab === "e" ? "C8" : "C7";
}

function namnN(z) {
  const ab = translate(z.charAt(1),
    "pqrstuvwxyz{|}",
    "oooooooooooooo");
  return ab === "o" ? "C10" : "C9";
}

function namnO(z) {
  const ab = translate(z.charAt(1),
    "nopqrstuvwxyz{|}",
    "mmmmmmmmmmmmmmmm");
  return ab === "m" ? "C12" : "C11";
}

function namnP(z) {
  const ab = translate(z.charAt(1),
    "jklmnopqrstuvwxyz{|}",
    "iiiiiiiiiiiiiiiiiiii");
  return ab === "i" ? "C14" : "C13";
}

function namnR(z) {
  const ab = translate(z.charAt(1),
    "klmnopqrstuvwxyz{|}",
    "jjjjjjjjjjjjjjjjjjj");
  return ab === "j" ? "C16" : "C15";
}

function namnS(z) {
  const ab = translate(z.charAt(1),
    "cdefghjlmnopqrswxyz{|}",
    "bbbbbbikkkkkkkkvvvvvvv");
  if (ab === "t") {
    const tb = translate(z.charAt(2),
      "pqstuvwxyz{|}",
      "rrrrrrrrrrrrr");
    return tb === "r" ? "D6" : "D5";
  }
  if (ab === "b") return "D2";
  if (ab === "i") return "D3";
  if (ab === "k") return "D4";
  if (ab === "u") return "D6";
  if (ab === "v") return "D7";
  return "D1";
}

function namnT(z) {
  const ab = translate(z.charAt(1),
    "pqrstuvwxyz{|}",
    "oooooooooooooo");
  return ab === "o" ? "D9" : "D8";
}

function namnV(z) {
  const ab = translate(z.charAt(1),
    "cdefghijklmnopqrstuvwxyz{|}",
    "bbbfffffkkkkkkkkkkkkkkkkkkk");
  if (ab === "f") return "D13";
  if (ab === "b") return "D12";
  if (ab === "k") return "D14";
  return "D11";
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
      relax_quotes: true,
      trim: true
    });
    if (type === 'main') {
      main = zRecs;
    } else {
      console.log(`INFO parsing "${f}" file...`);
      z[type] = {};
      let kprop = (type === 'id') ? 'Z308_ID' : (type === 'add') ? 'Z304_REC_KEY' : 'Z305_REC_KEY'
      let zc = 0;
      zRecs.forEach(r => {
        zc++;
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
        if (zc%10000 === 0) console.log(`  ${zc} lines processed`);
      });
      console.log(`  ${zc} "${f}" lines processed`);
    }
  }
  // throw(JSON.stringify(z, null, 2));
  
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
    let snum = hyllnr(nkey);
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
    let bc = (ids && ids['01']) ? ids['01'][0] : '';
    let bcPre = id.replace(/\d+/, '');
    let pid = (ids['03']) ? ids['03'][0] : '';
    let notes = [];
    nfields.forEach(f => {
      let n = p[f];
      if (n) notes.push(n);
    });
    let email = '';
    if (ads) {
      ads.forEach(r => {
        if (!email && r.Z304_EMAIL_ADDRESS) email = r.Z304_EMAIL_ADDRESS;
      });
    }
    // let un = email || '';

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
    let u = {
      id: uuid(id, ns),
      active: true,
      patronGroup: groupId,
      personal: {
        lastName: ln,
        firstName: fn,
      },
      customFields: {}
    };
    if (snum) u.personal.middleName = `(${snum})`;

    /* do not map anything to username (FOLIO-293)
    if (un && !unseen[un]) {
      u.username = un;
      unseen[un] = 1;
    } else if (unseen[un]) {
      console.log(`WARN username "${un}" already used.`);
    }
    */

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

    if (u.patronGroup && u.personal.lastName) {
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

      notes.forEach((n, i) => {
        let nid = uuid(`${id}::${n}::${i}`, ns);
        let note = {
          id: nid,
          content: `<p>${n}</p>`,
          title: ntitle,
          typeId: refData.noteTypes[ntype],
          domain: 'users',
          links: [ { id: u.id, type: 'user' } ]
        }
        if (note.typeId) {
          writeOut(files.n, note);
          ncount++;
        } else {
          console.log(`ERROR [notes] noteTypeId not found for "${ntype}" (${note.id})`)
        }
      });
      
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
      if (u.personal.lastName) {
        console.log(`ERROR lastName missing from user ${id}`);
      } else {
        console.log(`ERROR No patronGroup found for ${gnum}`);
      }
      ecount++;
    }
    if (count%10000 === 0) console.log(`INFO ${count} "z303" lines processed`);
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
