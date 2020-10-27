const fs = require('fs');
const uuid = require('uuid/v3');
const jsonFile = process.argv[2];
const path = require('path');

const ns = 'dfc59d30-cdad-3d03-9dee-d99117852eab';

const pgroup_map = {
  r: "Resident",
  n: "Non-Resident",
  c: "County",
  cs: "College Student",
  s: "K-12 Student",
  sl: "SPL Staff",
  ss: "Support"
};

const getDateByDays = (days) => {
  const ms = days * 86400 * 1000;
  const rdate = new Date(ms).toISOString();
  return rdate;
}

const daysNow = Math.floor(new Date().valueOf()/1000/86400);

try {
  if (jsonFile === undefined) {
    throw new Error('Usage: $ node splUsers.js <borrowers file>');
  }
  if (!fs.existsSync(jsonFile)) {
    throw new Error('Can\'t find borrowers file');
  }

  // Home address type
  const addType = '93d3d88d-499b-45d0-9bc7-ac73c3a19880';

  const usersIn = require(jsonFile);
  
  const records = {};
  records.users = [];
  let total = 0;

  usersIn.forEach(r => {
    total++;
    let uukey = r["borrower#"].toString();
    let id = uuid(uukey, 'dfc59d30-cdad-3d03-9dee-d99117852eab');
    let expiry = getDateByDays(r.expiration_date);
    let user = {
      id: id,
      expirationDate: expiry

    };
    if (r.expiration_date > daysNow) {
      user.active = true;
    } else {
      user.active = false;
    }
    user.externalSystemId = r['borrower#'].toString();
    user.barcode = r.bbarcode;
    user.patronGroup = pgroup_map[r.btype];
    let regDate = getDateByDays(r.registration_date);
    user.enrollmentDate = regDate;

    user.personal = {};
    let name = r.name_reconstructed.split(/, /, 2);
    user.personal.lastName = name[0];
    user.personal.firstName = name[1];
    user.personal.phone = r.phone_no;
    if (r.email_address) user.personal.email = r.email_address;
    user.personal.addresses = [];
    user.personal.dateOfBirth = getDateByDays(r.birth_date);
    let address = {
      addressTypeId: 'Home',
      addressLine1: r.borrower_address1,
      addressLine2: r.borrower_address2,
      city: r.borrower_address_city,
      region: r.borrower_address_state,
      postalCode: r.borrower_address_zip,
      countryId: 'US'
    };
    user.personal.addresses.push(address);

    user.username = user.barcode ||user.personal.email || user.externalSystemId || user.personal.lastName + user.personal.firstName;
    records.users.push(user);
  });
  
  let workDir = path.dirname(jsonFile);
  let fn = path.basename(jsonFile, '.json');
  let savePath = `${workDir}/user_import.json`;
  records.totalRecords = total;
  records.deactivateMissingUsers = false;
  records.updateOnlyPresentFields = false;
  const recString = JSON.stringify(records, null, 2);
  console.log(`Writing ${total} records to ${savePath}...`);
  fs.writeFileSync(savePath, recString);

} catch (e) {
  console.error(e.message);
}
