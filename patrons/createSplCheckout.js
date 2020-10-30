const fs = require('fs');
const path = require('path');

const jsonFile = process.argv[3];
const spFile = process.argv[2];

const getDateByDays = (days) => {
  const ms = days * 86400 * 1000;
  const rdate = new Date(ms).toISOString();
  return rdate;
}

const daysNow = Math.floor(new Date().valueOf()/1000/86400);

try {
  if (jsonFile === undefined) {
    throw new Error('Usage: $ node createSplCheckout.js <service points file> <loans file>');
  }
  if (!fs.existsSync(jsonFile)) {
    throw new Error('Can\'t find loans file');
  }
  if (!fs.existsSync(spFile)) {
    throw new Error('Can\'t find service points file');
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
  
  const records = {};
  records.checkouts = [];
  let total = 0;

  loans.forEach(r => {
    total++;
    let loan = {};
    loan.itemBarcode = r.ibarcode;
    loan.userBarcode = r.bbarcode;
    loan.loanDate = getDateByDays(r.last_cko_date);
    loan.dueDate = getDateByDays(r.due_date);
    loan.servicePointId = spMap[r.cko_location] || spMap.ill;
    records.checkouts.push(loan);
  });
    
  let workDir = path.dirname(jsonFile);
  let savePath = `${workDir}/checkouts.json`;
  records.totalRecords = total;
  const recString = JSON.stringify(records, null, 2);
  console.log(`Writing ${total} records to ${savePath}...`);
  fs.writeFileSync(savePath, recString);

} catch (e) {
  console.error(e.message);
}
