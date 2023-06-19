const fs = require('fs');
const path = require('path');

const inFile = process.argv[2];

(async () => {
  try {
    if (!inFile) {
      throw('Usage: node cubUserImport.js <cu-user-import-file>');
    }
    if (!fs.existsSync(inFile)) {
      throw(`Can't find user file at ${inFile}`);
    }
    const dir = path.dirname(inFile);
    let fn = path.basename(inFile);
    let fullPath = dir + '/ui-' + fn;

    const users = require(inFile);
    const ui = { users: [], included: users.included };
    for (let x = 0; x < users.users.length; x++) {
      let u = users.users[x];
      if (u.personal && u.personal.addresses) {
        for (let y = 0; y < u.personal.addresses.length; y++) {
          let a = u.personal.addresses[y];
          if (a.postal) {
            a.postalCode = a.postal;
            delete a.postal;
          }
        }
      }
      if (u.username) {
        ui.users.push(u);
      }
    }
    let ttl = ui.users.length;
    ui.totalRecords = ttl;
    ui.updateOnlyPresentFields = true;
    let outStr = JSON.stringify(ui, null, 2);
    // console.log(outStr);
    fs.writeFileSync(fullPath, JSON.stringify(ui, null, 2) + '\n');
    console.log('Total users', ttl);
  } catch (e) {
    console.log(e);
  }
})();