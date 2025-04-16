const readline = require('readline');
const fs = require('fs');
const path = require('path');
const uuid = require('uuid/v5');

const ns = '70c937ca-c54a-49cd-8c89-6edcf336e9ff';
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


try {
  if (!patronFile) throw 'Usage: node cubUsers.js <ref_directory> <sierra_patron_file> [ <default_email> ]';
  if (!fs.existsSync(patronFile)) throw `Can't find patron file: ${patronFile}!`;
  if (!fs.existsSync(refDir)) throw `Can't find ref data directory: ${refDir}!`;
  const saveDir = path.dirname(patronFile);
  const fileExt = path.extname(patronFile);
  const fileName = path.basename(patronFile, fileExt);
  const outPath = `${saveDir}/folio-${fileName}.jsonl`;
  const notePath = `${saveDir}/notes-${fileName}.jsonl`;
  const permPath = `${saveDir}/permusers-${fileName}.jsonl`;
  const mapPath = `${saveDir}/users.map`;
  const errPath = `${saveDir}/${fileName}-errors.jsonl`;
  if (fs.existsSync(outPath)) fs.unlinkSync(outPath);
  if (fs.existsSync(notePath)) fs.unlinkSync(notePath);
  if (fs.existsSync(permPath)) fs.unlinkSync(permPath);
  if (fs.existsSync(mapPath)) fs.unlinkSync(mapPath);
  if (fs.existsSync(errPath)) fs.unlinkSync(errPath);


  refDir = refDir.replace(/\/$/, '');

  const groupMap = {};

  // map folio groups from file
  const groups = require(`${refDir}/groups.json`);
  groups.usergroups.forEach(g => {
    // g.group = g.group.toLowerCase();
    groupMap[g.group] = g.id;
  });
  // let staff = groupMap['Library Departments'];
  // if (!staff) throw("Can't find 'staff' patron group!");
  let staff = 'hey!';
  
  // map ptypes from tsv file
  const ptypeGroup = {};
  let tsv = fs.readFileSync(`${refDir}/ptypes.tsv`, { encoding: 'utf8' });
  tsv.split(/\n/).forEach(l => {
    l = l.trim();
    if (l) {
      let c = l.split(/\t/);
      let ptype = c[1].trim();
      let pcode3 = (c[2]) ? c[2].trim() : '';
      let k = `${ptype}_${pcode3}`;
      // let gname = (c[4]) ? c[4].toLowerCase() : '';
      gname = (c[4]) ? c[4].trim() : '';
      if (groupMap[gname]) {
        ptypeGroup[k] = groupMap[gname];
      } else {
        console.log(`WARN patron group "${gname}" not found...`);
      }
    }
  });
  // console.log(ptypeGroup); return;

  // map folio addresstyes from file
  const atypes = require(`${refDir}/addresstypes.json`);
  let atypeMap = {};
  atypes.addressTypes.forEach(a => {
    atypeMap[a.addressType] = a.id;
  });

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
  let ecount = 0;
  const bseen = {};
  const eseen = {};
  const useen = {};

  const fileStream = fs.createReadStream(patronFile);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });
  rl.on('line', l => {
    count++;
    let patRec = JSON.parse(l);
    let pid = patRec.id.toString();
    let fixedFields = {};
    for (let code in patRec.fixedFields) {
      let ff = patRec.fixedFields[code];
      fixedFields[ff.label] = ff.value;
    }
    let varFields = {};
    for (let x = 0; x < patRec.varFields.length; x++) {
      let vf = patRec.varFields[x];
      let tag = vf.fieldTag;
      if (!varFields[tag]) {
        varFields[tag] = [];
      }
      varFields[tag].push(vf.content);
    }
    let name = [];
    if (varFields.n) {
      name = varFields.n[0].split(/, | /);
    }
    let active = true;
    let exptime = new Date(fixedFields['EXP DATE']).valueOf();
    if (exptime < today) active = false;
    let ptype = fixedFields['P TYPE'].trim();
    let pcode3 = fixedFields.PCODE3.trim();
    let groupKey = ptype + '_' + pcode3;
    let groupId = (ptypeGroup[groupKey]) ? ptypeGroup[groupKey] : ptypeGroup[ptype + '_*'];
    let uniId = (varFields.u) ? varFields.u[0] : '';
    let identaKey = (varFields.q) ? varFields.q[0] : (uniId) ? uniId : pid;
    let barcode = (varFields.b) ? varFields.b[0] : '';
    let user = {
      id: uuid(pid, ns),
      username: identaKey,
      patronGroup: groupId || `No group ID found for PTYPE ${ptype} PCODE3 ${pcode3}`,
      expirationDate: fixedFields['EXP DATE'],
      enrollmentDate: fixedFields['CREATED'],
      active: active,
      personal: {
        lastName: name[0],
        firstName: name[1],
        middleName: name.slice(2).join(' ') || '',
        email: (varFields.z) ? varFields.z[0] : '',
        phone: (varFields.p) ? varFields.p[0] : '',
        mobilePhone: (varFields.t) ? varFields.t[0] : '',
        addresses: [],
        preferredContactTypeId: '002'
      }
    }
    if (identaKey && !useen[identaKey]) {
      user.username = identaKey;
      useen[identaKey] = 1;
    }
    if (uniId && !eseen[uniId]) {
      user.externalSystemId = uniId;
      eseen[uniId] = 1;
    }
    if (defEmail) user.personal.email = defEmail;
    if (barcode && !bseen[barcode]) {
      user.barcode = barcode;
      bseen[barcode] = 1;
    }
    if (varFields.h) {
      user.personal.addresses = parseAddress(varFields.h, atypeMap['Home'], true);
    }
    if (varFields.a) {
      user.personal.addresses = user.personal.addresses.concat(parseAddress(varFields.a, atypeMap['Work'], false));
    }
    if (varFields.x) {
      for (let n = 0; n < varFields.x.length; n++) {
        ncount++;
        let note = makeNote(varFields.x[n], user.id, noteTypeId);
        fs.writeFileSync(notePath, JSON.stringify(note) + '\n', { flag: 'as' });
      }
    }

    if (user.username && groupId && groupId !== staff) {
      let uid = user.id;
      let pu = {
        id: uuid(uid, ns),
        userId: uid
      }
      fs.writeFileSync(outPath, JSON.stringify(user) + '\n', { flag: 'as' });
      let userBc = user.barcode || '';
      fs.writeFileSync(mapPath, `${pid}|${user.id}|${userBc}|${user.active}\n`, { flag: 'as' });
      fs.writeFileSync(permPath, JSON.stringify(pu) + '\n', { flag: 'as' });
      pcount++;
    } else {
      fs.writeFileSync(errPath, JSON.stringify(user) + '\n', { flag: 'a'});
      ecount++
    }
  
    if (count % 1000 === 0) {
      console.log(`Processed ${count} records...`);
    }
  });
  rl.on('close', () => {
    const t = (new Date().valueOf() - today) / 1000;
    console.log('------------');
    console.log('Finished!');
    console.log(`Saved ${count} users to ${outPath}`);
    console.log(`Saved ${ncount} notes to ${notePath}`);
    console.log(`Saved ${pcount} permusers to ${permPath}`);
    console.log('Errors:', ecount);
    console.log(`Time: ${t} secs.`);
  })

} catch (e) {
  console.log(e);
}
