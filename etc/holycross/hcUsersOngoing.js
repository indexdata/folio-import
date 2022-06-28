const readline = require('readline');
const fs = require('fs');
const path = require('path');

let refDir = process.argv[3];
const patronFile = process.argv[2];

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
  if (!patronFile) throw 'Usage: node hcUsers.js <sierra_patron_file>';
  if (!fs.existsSync(patronFile)) throw `Can't find patron file: ${patronFile}!`;
  // if (!fs.existsSync(refDir)) throw `Can't find ref data directory: ${refDir}!`;
  const saveDir = path.dirname(patronFile);
  const fileExt = path.extname(patronFile);
  const fileName = path.basename(patronFile, fileExt);
  const outPath = `${saveDir}/folio-${fileName}.jsonl`;
  const muiPath = `${saveDir}/mod-user-import-${fileName}`; 
  if (fs.existsSync(outPath)) fs.unlinkSync(outPath);

  let ftype = 0;
  if (patronFile.match(/\.json/)) ftype = 1;

/*
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
*/

  const today = new Date().valueOf();
  let count = 0;
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
   count++;
    l = l.trim();
    if (!l.match(/createdDate/)) {
      let c = l.split(/\|/);
      for (let x = 0; x < c.length; x++) {
        c[x] = c[x].trim();
      }
      let u = {};
      u.username = (c[9].match(/@/)) ? c[9] : c[1];
      if (c[0] === 'Active') { 
        u.active = true;
      } else {
        u.active = false;
      }
      if (c[1]) u.barcode = c[1];
      let dept = c[3];
      if (dept && !dept.match(/^No/i)) u.departments = [ dept ];
      if (c[4]) {
	let d = c[4].replace(/(..)-(..)-(....)/, '$3-$1-$2');
        u.enrollmentDate = d + 'T05:00:00.000Z';
      }
      if (c[5]) {
	let d = c[5].replace(/(..)-(..)-(....)/, '$3-$1-$2');
        u.expirationDate = d + 'T05:00:00.000Z';
      }
      u.externalSystemId = c[6];
      let pg = c[7];
      u.patronGroup = pg;
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
        addr.addressTypeId = 'Campus';
        addr.primaryAddress = true;
        per.addresses = [ addr ];
      }
      per.preferredContactTypeId = '002'; // email
      u.personal = per;
      if (u.personal.lastName && u.username) {
        succ++;
        u.patronGroup = pg;
        u.personal.preferredContactTypeId = 'email';
        if (u.personal.addresses && u.personal.addresses[0]) u.personal.addresses[0].addressTypeId = 'Campus';
        if (u.departments && u.departments[0]) u.departments[0] = dept;
        delete u.id;
        mui.users.push(u);
      } else {
        console.log('ERROR no lastName:', u.id, `"${u.username}"`);
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

    const t = (new Date().valueOf() - today) / 1000;
    console.log('------------');
    console.log('Finished!');
    console.log(`Saved ${succ} users to ${outPath}`);
    console.log('Errors:', err);
    console.log(`Time: ${t} secs.`);
  })

} catch (e) {
  console.log(e);
}
