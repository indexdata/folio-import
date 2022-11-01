const fs = require('fs');
const path = require('path');
const parse = require('csv-parse/lib/sync');
const readline = require('readline');

const spFile = process.argv[2];
const usersFile = process.argv[3];
const csvFile = process.argv[4];

(async () => {
  try {
    if (csvFile === undefined) {
      throw('Usage: node sulCheckouts.js <service_points_file> <users_file> <loans_csv_file>');
    }
    if (!fs.existsSync(csvFile)) {
      throw new Error('Can\'t find loans file');
    }
    if (!fs.existsSync(spFile)) {
      throw new Error('Can\'t find service points file');
    }
    if (!fs.existsSync(usersFile)) {
      throw new Error('Can\'t find service points file');
    }

    const sp = require(spFile);
    spMap = {};
    sp.servicepoints.forEach(s => {
      spMap[s.code] = s.id;
    });

    let csv = fs.readFileSync(csvFile, { encoding: 'utf8'});
    csv = csv.replace(/^\uFEFF/, ''); // remove BOM

    const inRecs = parse(csv, {
      columns: true,
      skip_empty_lines: true
    });

    const users = require(usersFile);
    delete require.cache[require.resolve(usersFile)];

    let active = {};
    users.users.forEach(u => {
      active[u.barcode] = { active: u.active, expirationDate: u.expirationDate };
    });

    // calculate time offset based on time changes 2022
    let dateOffset = (dt) => {
      let dzo = new Date(dt).getTimezoneOffset();
      let pto = ((dzo+120)/60);  // change this value according to the local machine that runs the script.
      out = `-0${pto}:00`;
      return out; 
    }

    const records = {};
    records.checkouts = [];
    const inactive = { checkouts: [] };
    const notFound = { checkouts: [] };
    const noDueDate = [];
    let total = 0;

    inRecs.forEach(r => {
      total++;
      if (1) {
        let loan = {};
        loan.itemBarcode = r['Item barcode'];
        loan.userBarcode = r['User barcode'];
        let odate = r['Charge datetime'].replace(/(\d{4})(\d\d)(\d\d)(\d\d)(\d\d)/, '$1-$2-$3T$4:$5:00');
        let os = dateOffset(odate);
        loan.loanDate = odate + os;
        let ddate = r['Due date/time'].replace(/(\d{4})(\d\d)(\d\d)(\d\d)(\d\d)/, '$1-$2-$3T$4:$5:00');
        os = dateOffset(ddate);
        loan.dueDate = ddate + os;
        let sp = r['Service point'];
        loan.servicePointId = spMap[sp];
        if (active[r.bbarcode] !== undefined) {
          records.checkouts.push(loan);
          if (active[loan.userBarcode] && active[loan.userBarcode].active === false) {
            loan.expirationDate = active[loan.userBarcode].expirationDate;
            inactive.checkouts.push(loan);
          }
        } else {
          notFound.checkouts.push(loan);
        } 
      } else {
        noDueDate.push(r); 
      }
    });

    let workDir = path.dirname(csvFile);
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

    let nddPath = `${workDir}/noduedates.json`;
    let nddTotal = noDueDate.length;
    console.log(`Writing ${nddTotal} to ${nddPath}...`);
    fs.writeFileSync(nddPath, JSON.stringify(noDueDate, null, 2));

  } catch (e) {
    console.error(e);
  }
})();
