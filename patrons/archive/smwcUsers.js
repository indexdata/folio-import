const fs = require('fs');
const path = require('path');
const parse = require('csv-parse/lib/sync');
const uuid = require('uuid/v5');

const patronFile = process.argv[2];
const ns = '06e59842-0697-4f82-a1bc-db8106fdaed1';

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
  if (!patronFile) throw 'Usage: node smwcUsers.js <sierra_patrons_csv>';
  if (!fs.existsSync(patronFile)) throw `Can't find patron file: ${patronFile}!`;
  const saveDir = path.dirname(patronFile);
  const fileExt = path.extname(patronFile);
  const fileName = path.basename(patronFile, fileExt);
  const muiPath = `${saveDir}/mod-user-import-${fileName}`; 
  const groupsPath = `${saveDir}/groupsMap.csv`;

  const today = new Date().valueOf();
  let count = 0;
  let succ = 0;
  let err = 0;

  let csv = fs.readFileSync(groupsPath, { encoding: 'utf8' });
  const groups = parse(csv, {
    columns: true,
    skip_empty_lines: true
  });

  const groupsMap = {};
  groups.forEach(g => {
    let code = g['SIERRA CODE'];
    let name = g['FOLIO PATRON GROUP'];
    groupsMap[code] = name;
  });

  csv = fs.readFileSync(patronFile, { encoding: 'utf8' });
  const inRecs = parse(csv, {
    columns: true,
    skip_empty_lines: true
  });
  let mui = { users: [] };

  let seen = {};
  let unSeen = {};
  let line = 0;
  inRecs.forEach(p => {
    line++;
    let userBc = p['P BARCODE'];
    userBc = userBc.replace(/^.+;/, '');
    if (userBc.match(/@/)) {
      p['EMAIL ADDR'] = userBc; 
      p['P BARCODE'] = '';
    }
    let email = p['EMAIL ADDR'];
    let fullName = p['PATRN NAME'];
    let altUn = fullName.replace(/[-,.' ]+/g, '');
    let key = userBc || email || altUn;
    let id = uuid(key, ns);
    let un = altUn;
    let pg = p['P TYPE'];
    if (key && !seen[key] && !unSeen[un]) {
      let name = fullName.split(/, /);
      let user = {
        id: id,
        externalSystemId: uuid(un, ns),
        username: un,
        barcode: userBc,
        active: true
      }
      user.patronGroup = groupsMap[pg];
      user.personal = {};
      user.personal.lastName = name[0];
      user.personal.firstName = name[1];
      if (email) user.personal.email = email;
      user.personal.preferredContactTypeId = 'email';
      if (user.personal.lastName) {
        mui.users.push(user);
        seen[key] = 1;
        unSeen[un] = 1;
        succ++;
      } else {
        err++;
      }
    } else if (key) {
      seen[key]++;
    }
  });

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
  console.log(`Saved ${succ} users to ${muiPath}`);
  console.log('Errors:', err);
  console.log(`Time: ${t} secs.`);
} catch (e) {
  console.log(e);
}
