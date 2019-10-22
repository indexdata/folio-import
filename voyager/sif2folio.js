const fs = require('fs');
const readline = require('readline');
const uuid = require('uuid/v4');
const sifFile = process.argv[2];
const jsonFile = process.argv[3];

const pgroup_map = {
  WITFACULTY: 'Faculty',
  WITALUMNUS: 'Alumna/us',
  WITEXHIBIT: 'Do not migrate',
  WITGRADUAT: 'Graduate Student',
  WITILL: 'Interlibrary Loan',
  WITNEWBOOK: 'Do not migrate',
  WITSTAFF: 'Staff',
  WITSTUDENT: 'Undergraduate Student',
  WITRETIREE: 'Retiree',
  ComCat: 'ComCat',
  SIM: 'FLO User'
};

const getData = (record, offset, length, format) => {
  const start = offset - 1;
  const end = start + length;
  let data = record.substring(start, end);
  data = data.trim();
  if (data) {
    if (format === 'n') {
      data = data.replace(/^0+/, '');
    }
    if (format === 'd') {
      data = data.replace(/\./g, '-');
      // data += 'T00:00.000+0000';
    }
  }
  return data;
};

try {
  if (sifFile === undefined) {
    throw new Error('Usage: $ node sif2folio.js <sif_file> [ <folio_users_file> ]');
  }
  if (!fs.existsSync(sifFile)) {
    throw new Error('Can\'t find input file');
  }
  if (jsonFile && fs.existsSync(jsonFile)) {
    throw new Error(`Output file "${jsonFile}" already exists!`);
  }
  const fileStream = fs.createReadStream(sifFile);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });
  const records = {};
  records.users = [];
  let total = 0;
  rl.on('line', r => {
    total++;
    let user = {};
    user.id = uuid();
    if (getData(r, 56, 1, 'n') === '1') {
      user.active = true;
    } else {
      user.active = false;
    }
    user.externalSystemId = getData(r, 239, 30);
    user.barcode = getData(r, 21, 25);
    user.username = user.barcode || user.externalSystemId;
    let pg = getData(r, 46, 10);
    user.patronGroup = pgroup_map[pg];
    user.enrollmentDate = getData(r, 179, 10, 'd');
    user.expirationDate = getData(r, 189, 10, 'd');
    user.updatedDate = getData(r, 219, 10, 'd');
    user.personal = {};
    user.personal.lastName = getData(r, 311, 30);
    user.personal.firstName = getData(r, 341, 20);
    user.personal.middleName = getData(r, 361, 20);
    user.personal.phone = getData(r, 776, 25);
    user.personal.mobilePhone = getData(r, 801, 25);
    user.personal.email = '';
    const addressCount = getData(r, 456, 1, 'n');
    user.personal.addresses = [];
    for (let x = 0; x < addressCount; x++) {
      let m = x * 429;
      let address = {};
      let at = getData(r, 467 + m, 1, 'n');
      if (at === '1') {
        address.addressTypeId = 'Home';
      } else if (at === '2') {
        address.addressTypeId = 'Campus';
      }
      address.addressLine1 = getData(r, 489 + m, 50);
      if (at === '3') {
        user.personal.email = address.addressLine1;
      } else {
        address.addressLine2 = getData(r, 539 + m, 40);
        address.city = getData(r, 699 + m, 40);
        address.region = getData(r, 739 + m, 7);
        address.postalCode = getData(r, 746 + m, 10);
        address.countryId = getData(r, 756 + m, 20) || 'US';
        user.personal.addresses.push(address);
      }
    }
    records.users.push(user);
  });
  rl.on('close', () => {
    records.totalRecords = total;
    records.deactivateMissingUsers = false;
    records.updateOnlyPresentFields = false;
    records.sourceType = sifFile.replace(/^(.+\/)?((.+)\..+$|(.+$))/, '$3$4');
    const recString = JSON.stringify(records, null, 2);
    if (jsonFile) {
      fs.writeFileSync(jsonFile, recString);
    } else {
      console.log(recString);
    }
  });
} catch (e) {
  console.error(e.message);
}
