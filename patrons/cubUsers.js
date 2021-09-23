const readline = require('readline');
const fs = require('fs');
const path = require('path');
const uuid = require('uuid/v5');

const ns = '70c937ca-c54a-49cd-8c89-6edcf336e9ff';
let refDir = process.argv[2];
const patronFile = process.argv[3];

// ptypes are groups derived from the P TYPE fixed field.  Use this for testing.
const ptypes = {
  '0': 'P TYPE 0',
  '1': 'P TYPE 1',
  '2': 'P TYPE 2',
  '3': 'P TYPE 3',
  '4': 'P TYPE 4',
  '5': 'P TYPE 5',
  '6': 'P TYPE 6',
  '7': 'P TYPE 7',
  '9': 'P TYPE 9',
  '10': 'P TYPE 10',
  '11': 'P TYPE 11',
  '13': 'P TYPE 13',
  '16': 'P TYPE 16',
  '23': 'P TYPE 23',
  '24': 'P TYPE 24',
  '29': 'P TYPE 29',
  '30': 'P TYPE 30',
  '202': 'P TYPE 202'
}



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

try {

  if (!patronFile) throw 'Usage: node cubUsers.js <ref_directory> <sierra_patron_file>';
  if (!fs.existsSync(refDir)) throw `Can't find ref data directory: ${refDir}!`;
  if (!fs.existsSync(patronFile)) throw `Can't find patron file: ${patronFile}!`;
  const saveDir = path.dirname(patronFile);
  const fileExt = path.extname(patronFile);
  const fileName = path.basename(patronFile, fileExt);
  const outPath = `${saveDir}/folio-${fileName}.jsonl`;
  if (fs.existsSync(outPath)) fs.unlinkSync(outPath);

  refDir = refDir.replace(/\/$/, '');

  const groupMap = {};
  // this block will create groups objects (to loaded into FOLIO) and a groupMap for creating users objects

  let groupFile = `${saveDir}/groups.jsonl`;
  console.log(`Creating user groups and saving as ${groupFile}`);
  if (fs.existsSync(groupFile)) fs.unlinkSync(groupFile);
  for (let pt in ptypes) {
    let group = {
      id: uuid(pt, ns),
      group: 'ptype' + pt,
      desc: ptypes[pt]
    }
    fs.writeFileSync(groupFile, JSON.stringify(group) + "\n", { flag: 'as' });
    groupMap[pt] = group.id;
  }

  /* map folio groups from file
  const groups = require(`${refDir}/groups.json`);
  groups.usergroups.forEach(g => {
    groupMap[g.group] = g.id;
  });
  */

  // map folio addresstyes from file
  const atypes = require(`${refDir}/addresstypes.json`);
  let atypeMap = {};
  atypes.addressTypes.forEach(a => {
    atypeMap[a.addressType] = a.id;
  });

  const today = new Date().valueOf();
  let count = 0;

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

    user = {
      id: uuid(pid, ns),
      externalSystemId: pid,
      username: (varFields.r && varFields.r[0]) ? varFields.r[0] : pid,
      patronGroup: groupMap[fixedFields['P TYPE']],
      expirationDate: fixedFields['EXP DATE'],
      active: active,
      personal: {
        lastName: name[0],
        firstName: name[1],
        middleName: name.slice(2).join(' ') || '',
        email: (varFields.z) ? varFields.z[0] : '',
        phone: (varFields.p) ? varFields.p[0] : '',
        mobilePhone: (varFields.t) ? varFields.t[0] : '',
        addresses: [],
      }
    }
    if (varFields.b && varFields.b[0]) {
      user.barcode = varFields.b[0];
    }
    if (varFields.h) {
      user.personal.addresses = parseAddress(varFields.h, atypeMap['Home'], true);
    }
    if (varFields.a) {
      user.personal.addresses = user.personal.addresses.concat(parseAddress(varFields.a, atypeMap['Work'], false));
    }

    fs.writeFileSync(outPath, JSON.stringify(user) + '\n', { flag: 'as' });
  
    if (count % 1000 === 0) {
      console.log(`Processed ${count} records...`);
    }
    //console.log(varFields);
    //console.log(JSON.stringify(user, null, 2));
  });
  rl.on('close', () => {
    const t = (new Date().valueOf() - today) / 1000;
    console.log('------------');
    console.log('Finished!');
    console.log(`Saved ${count} users to ${outPath}`);
    console.log(`Time: ${t} secs.`);
  })

} catch (e) {
  console.log(e);
}