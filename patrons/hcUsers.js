const readline = require('readline');
const fs = require('fs');
const path = require('path');
const uuid = require('uuid/v5');

const ns = '79f26dc9-ef9a-4aad-a4fc-9837e31ddc76';
let refDir = process.argv[2];
const patronFile = process.argv[3];

const parseAddress = (saddr, type, primary) => {
  let addresses = [];
  for (let x = 0; x < saddr.length; x++) {
    let parts = saddr[x].split(/\$/);
    let addr = {};
    addr.addressLine1 = parts[0]
    let country = parts[2];
    if (parts[1]) {
      addr.city = parts[1].replace(/,? ?[A-Z]{2} .*$/, '');
      addr.region = parts[1].replace(/.+([A-Z]{2}) \d{5}.*/, '$1');
      addr.postalCode = parts[1].replace(/.*(\d{5}(-\d{4})?)/, '$1');
    }
    addr.addressTypeId = type;
    addr.primaryAddress = primary;
    addresses.push(addr);
    break;
  }
  return addresses;
}

const makeNote = (mesg, userId, noteTypeId) => {
  const note = {
    id: uuid(userId + mesg, ns),
    content: mesg,
    domain: 'users',
    title:  mesg.substring(0, 20) + '...',
    typeId: noteTypeId,
    links: [
      {
        type: 'user',
        id: userId
      }
    ]
  }
  return note;
}

try {
  if (!patronFile) throw 'Usage: node hcUsers.js <ref_directory> <sierra_patron_file>';
  if (!fs.existsSync(patronFile)) throw `Can't find patron file: ${patronFile}!`;
  if (!fs.existsSync(refDir)) throw `Can't find ref data directory: ${refDir}!`;
  const saveDir = path.dirname(patronFile);
  const fileExt = path.extname(patronFile);
  const fileName = path.basename(patronFile, fileExt);
  const outPath = `${saveDir}/folio-${fileName}.jsonl`;
  const notePath = `${saveDir}/notes-${fileName}.jsonl`;
  const permPath = `${saveDir}/permusers-${fileName}.jsonl`;
  const muiPath = `${saveDir}/mod-user-import-${fileName}`; 
  const idFile = `${saveDir}/id-username-map.json`;
  if (fs.existsSync(outPath)) fs.unlinkSync(outPath);
  if (fs.existsSync(notePath)) fs.unlinkSync(notePath);
  if (fs.existsSync(permPath)) fs.unlinkSync(permPath);

  refDir = refDir.replace(/\/$/, '');

  let ftype = 0;
  if (patronFile.match(/\.json/)) ftype = 1;

  // map folio groups from file
  const groupMap = {};
  const groups = require(`${refDir}/groups.json`);
  groups.usergroups.forEach(g => {
    groupMap[g.group] = g.id;
  });

  // map folio addresstyes from file
  const atypes = require(`${refDir}/addresstypes.json`);
  let atypeMap = {};
  atypes.addressTypes.forEach(a => {
    atypeMap[a.addressType] = a.id;
  });

  const dtypes = require(`${refDir}/departments.json`);
  let deptMap = {};
  dtypes.departments.forEach(d => {
    deptMap[d.name] = d.id;
  });

  const ntypes = require(`${refDir}/note-types.json`);
  let ntypeMap = {};
  ntypes.noteTypes.forEach(n => {
    ntypeMap[n.name] = n.id;
  });
  const noteType = 'General note';
  let noteTypeId = ntypeMap[noteType];
  if (!noteTypeId) throw(`Note type ID for "${noteType}" not found!`);

  const ptypeMap = {};
  if (ftype) {
    let pdata = fs.readFileSync(`${refDir}/ptypes.tsv`, { encoding: 'utf8'});
    let lines = pdata.split('\n');
    lines.shift();
    lines.pop();
    lines.forEach(l => {
      let [k, n, v] = l.split(/\t/);
      ptypeMap[k] = v;
    });
  }
  
  const idMap = {};

  const today = new Date().valueOf();
  let count = 0;
  let ncount = 0;
  let pcount = 0;
  let succ = 0;
  let err = 0;

  const fileStream = fs.createReadStream(patronFile);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });
  const seen = {};
  const bcSeen = {};
  let mui;

  if (succ % 500 === 0) {
    mui = { users: [] };
  }
  rl.on('line', l => {
    if (ftype) {
      let j = JSON.parse(l);
      let vf = {};
      let notes = [];
      if (j.varFields) {
        j.varFields.forEach(v => {
          vf[v.fieldTag] = v.content;
          if (v.fieldTag.match(/[mx]/)) {
            if (v.content.match(/\S/)) notes.push(v.content);
          }
        });
      } else {
        throw new Error(`No varFields found in ${j.id}`);
      }
      let ptype = j.patronType;
      count = 1;
      let f = [];
      f[0] = 'Active';
      f[1] = j.barcodes[0] || '';
      f[2] = j.createdDate;
      if (j.addresses) {
        let add = j.addresses[0];
        f[3] = (ptype === 2 || ptype === 3 || ptype === 5) ? add.lines.shift() : '';
        f[8] = add.lines[0];
      }
      f[4] = j.createdDate;
      f[5] = j.expirationDate;
      if (j.uniqueIds) { 
        f[6] = j.uniqueIds[0].padStart(7, '0');
      } else {
        f[6] = 'p' + j.id;
      }
      f[7] = ptypeMap[ptype];
      f[9] = vf.z || '';
      idMap[j.id] = f[9];
      if (vf.n) {
        let fl = vf.n.split(/, /);
        f[10] = fl[1];
        f[11] = fl[0];
      }
      if (j.phones) {
        f[14] = j.phones[0].number;
      }
      f[15] = notes.join('%%');
      l = f.join('|');
    }
    count++;
    l = l.trim();
    if (!l.match(/createdDate/)) {
      let c = l.split(/\|/);
      for (let x = 0; x < c.length; x++) {
        c[x] = c[x].trim();
      }
      let u = {};
      u.username = (c[9].match(/@/)) ? c[9] : c[1];
      u.id = uuid(u.username, ns);
      if (c[15]) {
        let notes = c[15].split(/%%/);
        notes.forEach(n => {
          let noteObj = makeNote(n, u.username, noteTypeId);
          fs.writeFileSync(notePath, JSON.stringify(noteObj) + "\n", { flag: 'a' });
          ncount++;
        });
      }
      if (c[0] === 'Active') { 
        u.active = true;
      } else {
        u.active = false;
      }
      if (c[1]) u.barcode = c[1];
      let dept = c[3];
      if (dept && deptMap[dept]) u.departments = [ deptMap[dept] ];
      if (c[4]) {
        u.enrollmentDate = new Date(c[4]);
      }
      if (c[5]) {
        u.expirationDate = new Date(c[5]);
      }
      u.externalSystemId = c[6];
      let pg = c[7];
      u.patronGroup = groupMap[pg];
      let per = {};
      per.lastName = c[11];
      per.firstName = c[10];
      per.middleName = c[12];
      per.preferredFirstName = c[16];
      per.email = c[9];
      if (c[13]) per.mobilePhone = c[13];
      if (c[14]) per.phone = c[14];
      if (c[8]) {
        let addr = { addressLine1: c[8] };
        addr.addressTypeId = atypeMap['Campus'];
        addr.primaryAddress = true;
        per.addresses = [ addr ];
      }
      per.preferredContactTypeId = '002'; // email
      u.personal = per;
      if (!seen[u.id] && u.personal.lastName && u.username) {
        let ustr = JSON.stringify(u);
        fs.writeFileSync(outPath, `${ustr}\n`, { flag: 'as' });
        let pu = {
          id: uuid(u.id, ns),
          userId: u.id,
          permissions: []
        }
        let pstr = JSON.stringify(pu);
        fs.writeFileSync(permPath, pstr + '\n', { flag: 'as' });
        pcount++;
        succ++;
        seen[u.id] = 1;
        u.patronGroup = pg;
        u.personal.preferredContactTypeId = 'email';
        if (u.personal.addresses && u.personal.addresses[0]) u.personal.addresses[0].addressTypeId = 'Campus';
        if (u.departments && u.departments[0]) u.departments[0] = dept;
        delete u.id;
        mui.users.push(u);
      } else {
        if (! u.personal.lastName) {
          console.log('ERROR no lastName:', u.id, `"${u.username}"`);
        } else {
          console.log('ERROR Duplicate Ids:', u.id, `"${u.username}"`);
        }
        err++;
      }
      bcSeen[u.barcode] = 1;
    }
  });
  rl.on('close', () => {

    // create and write mod-user-import object;
    let muiCount = 0;
    while (mui.users.length > 0) {
      let out = {};
      out.users = mui.users.splice(0, 5000);
      out.totalRecords = out.users.length;
      out.deactivateMissingUsers = false;
      out.updateOnlyPresentFields = true;
      out.sourceType = '';
      let muiStr = JSON.stringify(out, null, 2);
      let outFile = `${muiPath}-${muiCount}.json`;
      console.log(`Writing to ${outFile}`);
      fs.writeFileSync(outFile, muiStr); 
      muiCount++;
    }

    fs.writeFileSync(idFile, JSON.stringify(idMap, null, 2 ));
    
    const t = (new Date().valueOf() - today) / 1000;
    console.log('------------');
    console.log('Finished!');
    console.log(`Saved ${succ} users to ${outPath}`);
    console.log(`Saved ${ncount} notes to ${notePath}`);
    console.log(`Saved ${pcount} permusers to ${permPath}`);
    console.log(`ID map saved to ${idFile}`);
    console.log('Errors:', err);
    console.log(`Time: ${t} secs.`);
  })

} catch (e) {
  console.log(e);
}