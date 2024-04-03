// migration email address should be oscarmail@scu.edu

const readline = require('readline');
const fs = require('fs');
const path = require('path');
const uuid = require('uuid/v5');

const ns = '6b8c1026-32cc-4388-a3a4-b84f34482fca';
let refDir = process.argv[2];
const patronFile = process.argv[3];
const defEmail = process.argv[4];

const ctagMap = {
  '007':'opt_0',
  '008':'opt_1',
  '009':'opt_2',
  '050':'opt_3',
  '051':'opt_4',
  '052':'opt_8',
  '053':'opt_5',
  '070':'opt_6',
  'xxx':'opt_7'
};

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
  if (!patronFile) throw 'Usage: node scuUsers.js <ref_directory> <sierra_patron_file> [ <default_email: oscarmail@scu.edu> ]';
  if (!fs.existsSync(patronFile)) throw `Can't find patron file: ${patronFile}!`;
  if (!fs.existsSync(refDir)) throw `Can't find ref data directory: ${refDir}!`;
  const saveDir = path.dirname(patronFile);
  const fileExt = path.extname(patronFile);
  const fileName = path.basename(patronFile, fileExt);
  const outPath = `${saveDir}/${fileName}-users.jsonl`;
  const notePath = `${saveDir}/${fileName}-notes.jsonl`;
  const permPath = `${saveDir}/${fileName}-perms-users.jsonl`;
  const reqPath = `${saveDir}/${fileName}-request-prefs.jsonl`;
  const mapPath = `${saveDir}/${fileName}-users.map`;
  const errPath = `${saveDir}/${fileName}-rejects.jsonl`;
  if (fs.existsSync(outPath)) fs.unlinkSync(outPath);
  if (fs.existsSync(notePath)) fs.unlinkSync(notePath);
  if (fs.existsSync(permPath)) fs.unlinkSync(permPath);
  if (fs.existsSync(reqPath)) fs.unlinkSync(reqPath);
  if (fs.existsSync(mapPath)) fs.unlinkSync(mapPath);
  if (fs.existsSync(errPath)) fs.unlinkSync(errPath);

  refDir = refDir.replace(/\/$/, '');

  const groupMap = {};

  // map folio groups from file
  const groups = require(`${refDir}/groups.json`);
  groups.usergroups.forEach(g => {
    groupMap[g.group] = g.id;
  });

  // map service points
  const spMap = {};
  const spoints = require(`${refDir}/service-points.json`);
  spoints.servicepoints.forEach(s => {
    spMap[s.code] = s.id;
  });
  // console.log(spMap); return;
  
  // map ptypes from tsv file
  const ptypeGroup = {};
  let tsv = fs.readFileSync(`${refDir}/ptypes.tsv`, { encoding: 'utf8' });
  let lc = 0;
  tsv.split(/\n/).forEach(l => {
    lc++;
    l = l.trim();
    if (l) {
      let c = l.split(/\t/);
      let ptype = c[0].trim();
      gname = (c[2]) ? c[2].trim() : '';
      if (groupMap[gname]) {
        ptypeGroup[ptype] = groupMap[gname];
      } else if (lc !== 1) {
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
  let success = 0;
  let ncount = 0;
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
    let name = {};
    if (varFields.n) {
      let full = varFields.n[0];
      let [l, fs] = full.split(/, /);
      name.l = l;
      if (fs) {
      let [f, m] = fs.split(/ /);
        name.f = f;
        name.m = m;
      }
    }
    let active = true;
    let exptime = new Date(fixedFields['EXP DATE']).valueOf();
    if (exptime < today) active = false;
    let ptype = (fixedFields['P TYPE']) ? fixedFields['P TYPE'].trim() : '';
    let utype = (ptype === '2' || ptype === '18') ? 'staff' : 'patron';
    let pcode2 = (fixedFields.PCODE2) ? fixedFields.PCODE2.trim() : '';
    let groupId = (ptypeGroup[ptype]) ? ptypeGroup[ptype] : '';
    let exId = (varFields.f) ? varFields.f[0] : '';
    let un = (varFields.y) ? varFields.y[0].replace(/@.+$/, '') : '';
    let barcode = (varFields.b) ? varFields.b.shift() : '';
    let phone = (varFields.t) ? varFields.t.shift() : '';
    let sp = (fixedFields['HOME LIBR']) ? fixedFields['HOME LIBR'].trim() : '';
    let user = {
      id: uuid(pid, ns),
      patronGroup: groupId || '',
      expirationDate: fixedFields['EXP DATE'],
      enrollmentDate: fixedFields['CREATED'],
      active: active,
      type: utype,
      personal: {
        lastName: name.l,
        firstName: name.f,
        middleName: name.m || '',
        phone: phone,
        addresses: [],
        preferredContactTypeId: '002'
      },
      customFields: {}
    }
    if (!user.patronGroup) patRec.errMessage = `No group ID found for PTYPE '${ptype}'`;
    if (un) user.username = un;
    if (exId) user.externalSystemId = exId;
    if (un) useen[un] = 1;
    if (defEmail) { 
      user.personal.email = defEmail;
    } else if (varFields.z) {
      user.personal.email = varFields.z.shift();
    }
    if (barcode && !bseen[barcode]) {
      user.barcode = barcode;
      bseen[barcode] = 1;
    } else if (barcode) {
      varFields.b.unshift(barcode);
    }

    user.customFields.sierraRecordNumber = 'p' + pid;

    let addEmails = [];
    if (varFields.z) {
      varFields.z.forEach(e => {
        if (addEmails.indexOf(e) === -1 && e !== user.personal.email) addEmails.push(e);
      });
    }
    if (varFields.y) {
      varFields.y.forEach(e => {
        if (addEmails.indexOf(e) === -1 && e !== user.personal.email) addEmails.push(e);
      });
    }
    let uniIds = [];
    if (varFields.d) {
      varFields.d.forEach(x => {
        if (uniIds.indexOf(x) === -1 && x !== user.externalSystemId) uniIds.push(x);
      });
    }

    if (addEmails[0]) {
      user.customFields.additionalEmailAddresses = addEmails.join(', ');
    }
    if (varFields.b && varFields.b[0]) {
      user.customFields.additionalBarcodes = varFields.b.join(', ');
    }
    if (varFields.p) {
      user.customFields.additionalPhoneNumbers = varFields.p.join(', ');
    }
    if (uniIds[0]) {
      user.customFields.universityId = varFields.d.join(', ');
    }
    if (varFields.c) {
      let v = varFields.c[0];
      user.customFields.specialPatronGroup = ctagMap[v] || ctagMap.xxx;
    }

    if (varFields.a) {
      user.personal.addresses = user.personal.addresses.concat(parseAddress(varFields.a, atypeMap['Mailing'], true));
    }
    if (varFields.h) {
      let atype = (varFields.a) ? false : true;
      user.personal.addresses = parseAddress(varFields.h, atypeMap['Additional'], atype);
    }

    if (varFields.x) {
      for (let n = 0; n < varFields.x.length; n++) {
        ncount++;
        let note = makeNote(varFields.x[n], user.id, noteTypeId);
        fs.writeFileSync(notePath, JSON.stringify(note) + '\n', { flag: 'as' });
      }
    }
    if (varFields.m) {
      for (let n = 0; n < varFields.m.length; n++) {
        ncount++;
        let note = makeNote(varFields.m[n], user.id, noteTypeId);
        fs.writeFileSync(notePath, JSON.stringify(note) + '\n', { flag: 'as' });
      }
    }

    if (groupId && pcode2 !== 'z') {
      let uid = user.id;

      // create perms user
      let pu = {
        id: uuid(uid, ns),
        userId: uid,
        permissions: []
      }

      // create request preference
      let rp = {
        id: uuid(uid + 'rp', ns),
        userId: uid,
        holdShelf: true,
        delivery: false,
      }
      if (sp === 'ulpat') {
        rp.defaultServicePointId = spMap['ulhelpdesk'];
      } else if (sp === 'heafe') {
        rp.defaultServicePointId = spMap['llcircdesk'];
      }

      fs.writeFileSync(outPath, JSON.stringify(user) + '\n', { flag: 'as' });
      let userBc = user.barcode || '';
      fs.writeFileSync(mapPath, `${pid}|${user.id}|${userBc}|${user.active}\n`, { flag: 'as' });
      fs.writeFileSync(permPath, JSON.stringify(pu) + '\n', { flag: 'as' });
      fs.writeFileSync(reqPath, JSON.stringify(rp) + '\n', { flag: 'as' });
      success++;
    } else {
      if (!patRec.errMessage) patRec.errMessage = "PCODE2 = 'z'";
      fs.writeFileSync(errPath, JSON.stringify(patRec) + '\n', { flag: 'a'});
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
    console.log('Processed:', count);
    console.log('Users created:', success, '-->', outPath);
    console.log('Perms created:', success, '-->', permPath);
    console.log('Prefs created:', success, '-->', reqPath);
    console.log('Notes created:', ncount, '-->', notePath);
    console.log('Rejects:', ecount, '-->', errPath);
    console.log('Time (secs):', t);
  })

} catch (e) {
  console.log(e);
}
