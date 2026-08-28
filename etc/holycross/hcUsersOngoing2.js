const readline = require('readline');
const fs = require('fs');
const path = require('path');

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
        if (cols[x] && c[x]) r[cols[x]] = c[x];
        console.log(r);
      }
    }
  });
  rl.on('close', () => {
    console.log(`Records created: ${uc}`);
  });

} catch (e) {
  console.log(e);
}
