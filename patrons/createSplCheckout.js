const fs = require('fs');
const path = require('path');

const jsonFile = process.argv[4];
const usersFile = process.argv[3];
const spFile = process.argv[2];

const getDateByDays = (days) => {
  const ms = days * 86400 * 1000;
  const rdate = new Date(ms).toISOString();
  return rdate;
}

const daysNow = Math.floor(new Date().valueOf()/1000/86400);

try {
  if (jsonFile === undefined) {
    throw new Error('Usage: $ node createSplCheckout.js <service points file> <users file> <loans file>');
  }
  if (!fs.existsSync(jsonFile)) {
    throw new Error('Can\'t find loans file');
  }
  if (!fs.existsSync(spFile)) {
    throw new Error('Can\'t find service points file');
  }
  if (!fs.existsSync(usersFile)) {
    throw new Error('Can\'t find users file');
  }

  const getDateByDays = (days) => {
    const ms = days * 86400 * 1000;
    const rdate = new Date(ms).toISOString();
    return rdate;
  }

  const sp = require(spFile);
  spMap = {};
  sp.servicepoints.forEach(s => {
    let code = s.code.replace(/-.+$/, '');
    spMap[code] = s.id;
  });

  const loans = require(jsonFile);
  const users = require(usersFile);
  delete require.cache[require.resolve(usersFile), require.resolve(jsonFile)];

  let active = {};
  users.users.forEach(u => {
    active[u.barcode] = { active: u.active, expirationDate: u.expirationDate };
  });

  const records = {};
  records.checkouts = [];
  const inactive = { checkouts: [] };
  const notFound = { checkouts: [] };
  let total = 0;

  loans.forEach(r => {
    total++;
    let loan = {};
    loan.itemBarcode = r.ibarcode;
    loan.userBarcode = r.bbarcode;
    loan.loanDate = getDateByDays(r.last_cko_date);
    loan.dueDate = getDateByDays(r.due_date);
    loan.servicePointId = spMap[r.cko_location] || spMap.ill;
    if (active[r.bbarcode] !== undefined) {
      records.checkouts.push(loan);
      if (active[r.bbarcode].active === false) {
	loan.expirationDate = active[r.bbarcode].expirationDate;
        inactive.checkouts.push(loan);
      }
    } else {
      notFound.checkouts.push(loan);
    }
  });

  let workDir = path.dirname(jsonFile);
  let savePath = `${workDir}/checkouts.json`;
  records.totalRecords = records.checkouts.length;
  const recString = JSON.stringify(records, null, 2);
  console.log(`Writing ${records.checkouts.length} records to ${savePath}...`);
  fs.writeFileSync(savePath, recString);

  let inactPath = `${workDir}/inactive_checkouts.json`;
  inactive.totalRecords = inactive.checkouts.length;
  console.log(`Writing ${inactive.totalRecords} to ${inactPath}...`);
  fs.writeFileSync(inactPath, JSON.stringify(inactive, null, 2));

  let nfPath = `${workDir}/notfound_checkouts.json`;
  notFound.totalRecords = notFound.checkouts.length;
  console.log(`Writing ${notFound.totalRecords} to ${nfPath}...`);
  fs.writeFileSync(nfPath, JSON.stringify(notFound, null, 2));

} catch (e) {
  console.error(e.message);
}
