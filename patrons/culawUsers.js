const readline = require('readline');
const fs = require('fs');
const path = require('path');
const uuid = require('uuid/v5');

const ns = 'ae22ce95-da28-4618-9100-acee9badbbc0';
let refDir = process.argv[2];
const patronFile = process.argv[3];
const defEmail = process.argv[4];

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

const parseDate = (date) => {
  let out = date.replace(/(..)-(..)-(....)/, '$3-$1-$2');
  out = out.replace(/^(..)-(..)-(..)/, '19$3-$1-$2');
  return out;
}


try {
  if (!patronFile) throw 'Usage: node culawUsers.js <ref_directory> <sierra_patron_file> [ <default_email> ]';
  if (!fs.existsSync(patronFile)) throw `Can't find patron file: ${patronFile}!`;
  if (!fs.existsSync(refDir)) throw `Can't find ref data directory: ${refDir}!`;
  const saveDir = path.dirname(patronFile);
  const fileExt = path.extname(patronFile);
  const fileName = path.basename(patronFile, fileExt);
  const outPath = `${saveDir}/folio-${fileName}.jsonl`;
  const notePath = `${saveDir}/notes-${fileName}.jsonl`;
  const permPath = `${saveDir}/permusers-${fileName}.jsonl`;
  if (fs.existsSync(outPath)) fs.unlinkSync(outPath);
  if (fs.existsSync(notePath)) fs.unlinkSync(notePath);
  if (fs.existsSync(permPath)) fs.unlinkSync(permPath);

  refDir = refDir.replace(/\/$/, '');

  const groupMap = {};

  // map folio groups from file
  const groups = require(`${refDir}/groups.json`);
  groups.usergroups.forEach(g => {
    groupMap[g.group] = g.id;
  });
  let ptypes = {
    '20': groupMap['Law Public Patron'],
    '21': groupMap['Law Public Patron'],
    '30': groupMap['Law ILL']
  };
  // console.log(ptypes); return;


  // map folio addresstyes from file
  const atypes = require(`${refDir}/addresstypes.json`);
  let atypeMap = {};
  atypes.addressTypes.forEach(a => {
    atypeMap[a.addressType] = a.id;
  });
  const home = atypeMap['Home'];

  // map note types
  const ntypes = require(`${refDir}/note-types.json`);
  let ntypeMap = {};
  ntypes.noteTypes.forEach(n => {
    ntypeMap[n.name] = n.id;
  });
  const noteType = 'General note';
  let noteTypeId = ntypeMap[noteType];
  if (!noteTypeId) throw(`Note type ID for "${noteType}" not found!`);

  const today = new Date().valueOf();
  let count = 0;
  let ncount = 0;
  let pcount = 0;
  let ucount = 0;

  const fileStream = fs.createReadStream(patronFile);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });
  let ff = {};
  let fns = [];
  rl.on('line', l => {
    count++;
    l = l.replace(/^"|"$/g, '');
    if (count === 1) {
      fns = l.split(/"\|"/);
    } else {
      l.split(/"\|"/).forEach((d, i) => {
        ff[fns[i]] = d;
      });
      if (process.env.DEBUG) console.log(ff);
      let notes = [];
      let active = true;
      let expiry = ff['EXP DATE'];
      expiry = parseDate(expiry);
      let created = ff['CREATED(PATRON)'];
      created = parseDate(created);
      let exptime = new Date(expiry).valueOf();
      if (exptime < today) active = false;
      let ptype = (ff['P TYPE']) ? ff['P TYPE'].trim() : '';
      let pcode3 = ff.PCODE3.trim();
      let groupId = (ptypes[ptype]) ? ptypes[ptype] : ptype;
      let pid = ff['RECORD #(PATRON)'];
      let uname = (ff.IDENTIKEY) ? ff.IDENTIKEY : (ff['EMAIL ADDR']) ? ff['EMAIL ADDR'] : pid;
      let eaddr = ff['EMAIL ADDR'];
      let pname = ff['PATRN NAME'] || 'Unknown, Name';
      let name = pname.split(/, /);
      let fname = (name[1]) ? name[1].split(/ /, 2) : '';
      let phone = ff['PRI TEL'];
      let sadd = ff['PRI ADDR'];
      let addr = (sadd) ? parseAddress([ sadd ], home, true) : [];
      let bcode = ff['P BARCODE'];
      let pmsg = ff['MESSAGE(PATRON)'];
      let pnote = ff['NOTE(PATRON)'];
      if (pmsg) notes.push(pmsg);
      if (pnote) notes.push(pnote);
      let user = {
        id: uuid(pid, ns),
        username: uname,
        patronGroup: groupId || `No group ID found for PTYPE ${ptype} PCODE3 ${pcode3}`,
        expirationDate: expiry,
        enrollmentDate: created,
        active: active,
        personal: {
          lastName: name[0],
          firstName: fname[0],
          middleName: fname[1],
          email: (eaddr) ? eaddr : '',
          phone: phone,
          addresses: addr,
          preferredContactTypeId: '002'
        }
      }
      if (defEmail) user.personal.email = defEmail;
      if (bcode) {
        user.barcode = bcode;
      }
      for (let n = 0; n < notes.length; n++) {
        ncount++;
        let note = makeNote(notes[n], user.id, noteTypeId);
        fs.writeFileSync(notePath, JSON.stringify(note) + '\n', { flag: 'as' });
      }
      fs.writeFileSync(outPath, JSON.stringify(user) + '\n', { flag: 'as' });
      ucount++;

      let uid = user.id;
      let pu = {
        id: uuid(uid, ns),
        userId: uid
      };
      fs.writeFileSync(permPath, JSON.stringify(pu) + '\n', { flag: 'as' });
      pcount++;
    }
  });
  rl.on('close', () => {
    const t = (new Date().valueOf() - today) / 1000;
    console.log('------------');
    console.log('Finished!');
    console.log(`Saved ${ucount} users to ${outPath}`);
    console.log(`Saved ${ncount} notes to ${notePath}`);
    console.log(`Saved ${pcount} permusers to ${permPath}`);
    console.log(`Time: ${t} secs.`);
  })

} catch (e) {
  console.log(e);
}