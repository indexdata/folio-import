const readline = require('readline');
const fs = require('fs');
const path = require('path');

const patronFile = process.argv[2];

const headers = [ 'username', 'externalSystemId', 'barcode', 'active', 'patronGroup', 'department_1', 'firstName', 'lastName', 
  'middleName','email','phone','mobilePhone','preferredContactType', 'cust_tapid', 'cust_expectedGraduationDate'
];

const hpos = {};
headers.forEach((h,el) => {
  hpos[h] = el
});

const fmap = {
  Active: 'active',
  Barcode: 'barcode',
  createdDate: 'enrollmentDate',
  tapid: 'cust_tapid',
  graduation: 'cust_expectedGraduationDate',
  preferredContactTypeId: 'preferredContactType',
  departments: 'department_1'
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
};

const parseDate = (text) => {
  let out; 
  try { 
    out = new Date(text).toISOString();
    return out;
  } catch(e) {
    console.log(`WARN ${e} (${text})`);
    return '';
  }
};

const makeCsvLine = (obj) => {
  let arr = [];
  for (let h in hpos) {
    let pos = hpos[h];
    arr[pos] = obj[h];
  }
  return arr.join(',');
};
let head = headers.join(',');
console.log(head);
try {
  if (!patronFile) throw 'Usage: node hcUsersOngoing2 <sierra_patron_file>';
  if (!fs.existsSync(patronFile)) throw `Can't find patron file: ${patronFile}!`;

  const fileStream = fs.createReadStream(patronFile);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });
  
  let lc = 0;
  let uc = 0;
  let cols;
  rl.on('line', l => {
    lc++;
    let c = l.split(/\|/);
    if (lc === 1) {
      cols = c;
    } else if (c) {
      uc++;
      let r = {};
      for (let x = 0; x <= cols.length; x++) {
        let prop = fmap[cols[x]] || cols[x];
        if (prop && c[x]) r[prop] = c[x];
      }
      r.username = r.email || r.barcode;
      if (r.expirationDate) r.expirationDate = parseDate(r.expirationDate);
      if (r.preferredContactType) r.preferredContactType = r.preferredContactType.toLowerCase();
      delete r.enrollmentDate;
      delete r.updateDate;
      r.active = (r.active === 'Active') ? 'true' : 'false'; 
      if (r.department_1 === 'No') delete r.department_1;
      console.log(r);
      let row = makeCsvLine(r);
      console.log(row);
    }
  });
  rl.on('close', () => {
    console.log(`Records created: ${uc}`);
  });

} catch (e) {
  console.log(e);
}
