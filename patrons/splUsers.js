const fs = require('fs');
const uuid = require('uuid/v3');
const path = require('path');
const readline = require('readline');
const { ConsoleTransportOptions } = require('winston/lib/winston/transports');

const jsonFile = process.argv[2];
const size = (process.argv[3]) ? parseInt(process.argv[3], 10) : 5000;

const ptype2group = {
  al: "Adult Limited",
  b: "Business",
  c: "County",
  co: "Community",
  cs: "College Student",
  de: "Deactivated",
  dm: "Direct Mail",
  hs: "Home Service",
  il: "ILL",
  ill: "Inter-library Loan",
  jl: "Juvenile Limited",
  n: "Non-Resident",
  ol: "Online Only",
  r: "Resident",
  ri: "Institition",
  ro: "Outreach",
  rt: "Resident Teacher",
  sc: "City Staff",
  si: "Internal Only",
  sl: "SPL Staff",
  sr: "Self-Registered",
  ss: "Support",
  st: "K-12 Student",
  sv: "Service Accounts",
  t: "Teacher",
  tt: "Testing Accounts"
};

const getDateByDays = (days) => {
  const ms = days * 86400 * 1000;
  const rdate = new Date(ms).toISOString();
  return rdate;
}

const getBadJSON = (jsonFile) => {
  return new Promise(resolve => {
    console.log(`${jsonFile} is not valid json, trying to fix...`);
    const fileStream = fs.createReadStream(jsonFile);
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });
    let users = [];
    let userObj;
    let i = 0
    rl.on('line', l => {
      i++;
      if (l.match(/^\s*{/)) {
        userObj = {};
      } else if (l.match(/^\s*}/)) {
        users.push(userObj);
      } else {
        let kv = l.split(/": /, 2);
        let key = kv[0].replace(/^\s*"/, '');
        let val = '';
        if (kv[1]) {
          val = kv[1].replace(/,$/, '');
          if (!kv[1].match(/^"/)) {
            userObj[key] = (kv[1].match(/\d/)) ? parseInt(kv[1], 10) : null;
          } else {
            val = val.replace(/^"(.*)"/, '$1');
            if (val === 'None') val = '';
            userObj[key] = val;
          }
        }
      }
    });
    rl.on('close', () => {
      resolve(users);
    });
  });
}

const daysNow = Math.floor(new Date().valueOf()/1000/86400);

(async () => {

  try {
    if (jsonFile === undefined) {
      throw new Error('Usage: $ node splUsers.js <borrowers file> [<batch size>]');
    }
    if (!fs.existsSync(jsonFile)) {
      throw new Error('Can\'t find borrowers file');
    }

    let usersIn = [];
    try {
      usersIn = require(jsonFile);
    } catch (e) {
      usersIn = await getBadJSON(jsonFile);
    }
    
    const records = {};
    records.users = [];
    let creds = [];
    let perms = { permissionUsers: [] };

    const errors = [];
    let total = 0;
    let errttl = 0;
    let batch = 0;
    let ttl = 0;
    let workDir = path.dirname(jsonFile);

    const groups = require(`${workDir}/groups.json`);
    let gmap = {};
    groups.usergroups.forEach(g => {
      gmap[g.group] = g.id;
    });
    let pgroup_map = {}; 
    for (let k in ptype2group) {
      pgroup_map[k] = gmap[ptype2group[k]];
    }

    usersIn.forEach(r => {
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
        addressTypeId: '93d3d88d-499b-45d0-9bc7-ac73c3a19880',
        addressLine1: r.borrower_address1,
        addressLine2: r.borrower_address2,
        city: r.borrower_address_city,
        region: r.borrower_address_state,
        postalCode: r.borrower_address_zip,
        countryId: 'US'
      };
      user.personal.addresses.push(address);
      user.personal.preferredContactTypeId = '002';

      user.username = user.barcode || uukey;
      if (user.patronGroup && user.username) {
        records.users.push(user);
        if (r.pin) {
          let credObj = {
            userId: user.id,
            username: user.username,
            password: r.pin
          }
          creds.push(credObj);
        }
        let permObj = {
          id: uuid(user.id, 'dfc59d30-cdad-3d03-9dee-d99117852eab'),
          userId: user.id,
          permissions: []
        };
        perms.permissionUsers.push(permObj);
        total++;
      } else {
        errors.push(r);
        errttl++;
      }
      ttl++;
      if (total === size || ttl === usersIn.length) {
        batch++;
        let set = batch.toString();
        set = set.padStart(5, '0');
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
    if (creds.length > 0) {
      const credPath = `${workDir}/logins.json`;
      const credOut = JSON.stringify(creds, null, 2);
      console.log(`Writing ${creds.length} credentials records to ${credPath}`);
      fs.writeFileSync(credPath, credOut);
    }
    if (perms.permissionUsers.length > 0) {
      const permPath = `${workDir}/perms.json`;
      const permOut = JSON.stringify(perms, null, 2);
      console.log(`Writing ${perms.permissionUsers.length} credentials records to ${permPath}`);
      fs.writeFileSync(permPath, permOut);
    }
    if (errors.length > 0) {
      const errPath = `${workDir}/errors.json`;
      const errOut = JSON.stringify(errors, null, 2);
      console.log(`Writing ${errttl} error records to ${errPath}`);
      fs.writeFileSync(errPath, errOut);
    }
  } catch (e) {
    console.error(e.message);
  }
})();
