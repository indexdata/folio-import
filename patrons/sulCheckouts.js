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

    const files = {
      co: 'checkouts.json',
      ia: 'inactive_checkouts.json',
      nf: 'notfound_checkouts.json'
    };

    let workDir = path.dirname(csvFile);
    for (let f in files) {
      files[f] = workDir + '/' + files[f];
    }

    const write = (obj, file) => {
      console.log(`Writing ${obj.checkouts.length} to ${file}`);
      fs.writeFileSync(file, JSON.stringify(obj, null, 2));
    };

    const records = {};
    records.checkouts = [];
    const inactive = { checkouts: [] };
    const notFound = { checkouts: [] };
    let total = 0;

    inRecs.forEach(r => {
      total++;
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
      let cr = r['Claims returned date'];
      if (cr.match(/\d{8}/)) {
        let crdate = cr.replace(/(\d{4})(\d\d)(\d\d)/, '$1-$2-$3T12:00:00');
        let crd = crdate + dateOffset(crdate);
        loan.claimedReturnedDate = crd;
      }
      if (active[r.bbarcode] !== undefined) {
        records.checkouts.push(loan);
        if (active[loan.userBarcode] && active[loan.userBarcode].active === false) {
          loan.expirationDate = active[loan.userBarcode].expirationDate;
          inactive.checkouts.push(loan);
        }
      } else {
        notFound.checkouts.push(loan);
      } 
    });

    records.totalRecords = records.checkouts.length;
    write(records, files.co);
    inactive.totalRecords = inactive.checkouts.length;
    write(inactive, files.ia);
    notFound.totalRecords = notFound.checkouts.length;
    write(notFound, files.nf);

  } catch (e) {
    console.error(e);
  }
})();
