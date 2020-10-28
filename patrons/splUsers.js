const fs = require('fs');
const uuid = require('uuid/v3');
const path = require('path');

const jsonFile = process.argv[2];
const size = (process.argv[3]) ? parseInt(process.argv[3], 10) : 5000;

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
    throw new Error('Usage: $ node splUsers.js <borrowers file> [<batch size>]');
  }
  if (!fs.existsSync(jsonFile)) {
    throw new Error('Can\'t find borrowers file');
  }

  const usersIn = require(jsonFile);
  
  const records = {};
  records.users = [];
  let total = 0;
  let batch = 0;
  let ttl = 0;

  usersIn.forEach(r => {
    total++;
    ttl++;
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

    if (total === size || ttl === usersIn.length) {
      batch++;
      let set = batch.toString();
      set = set.padStart(5, '0');
      let workDir = path.dirname(jsonFile);
      let fn = path.basename(jsonFile, '.json');
      let savePath = `${workDir}/users_${set}.json`;
      records.totalRecords = total;
      records.deactivateMissingUsers = false;
      records.updateOnlyPresentFields = false;
      const recString = JSON.stringify(records, null, 2);
      console.log(`Writing ${total} records to ${savePath}...`);
      fs.writeFileSync(savePath, recString);
      total = 0;
      records.users = [];
    }

  });

  

} catch (e) {
  console.error(e.message);
}
