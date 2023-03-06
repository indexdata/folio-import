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
      throw new Error('Can\'t find users file');
    }

    const sp = require(spFile);
    spMap = {};
    sp.servicepoints.forEach(s => {
      spMap[s.code] = s.id;
    });

    /* let csv = fs.readFileSync(csvFile, { encoding: 'utf8'});
    csv = csv.replace(/^\uFEFF/, ''); // remove BOM
    csv.split(/\n/).forEach(line => {
      console.log(line);
    }); */

    const fileStream = fs.createReadStream(csvFile);
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });

    let csv = '';
    let lcount = 0;
    let ccount = 0;
    for await (let line of rl) {
      lcount++;
      if (lcount === 1) {
        line = line.replace(/^\uFEFF/, ''); // remove BOM
        ccount = line.split(/,/).length;
      }
      let cols = line.split(/,/);
      if (cols.length < ccount) line += ','; 
      csv += line + '\n';
    }

    const inRecs = parse(csv, {
      columns: true,
      skip_empty_lines: true
    });
    
    console.log('Loading users into memory...')
    const users = require(usersFile);
    delete require.cache[require.resolve(usersFile)];

    let active = {};
    let ucount = 0;
    users.users.forEach(u => {
      active[u.barcode] = { active: u.active, expirationDate: u.expirationDate };
      ucount++;
    });
    console.log(`(${ucount} users loaded...)`);

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
    let pcount = 0;

    inRecs.forEach(r => {
      total++;
      let loan = {};
      loan.itemBarcode = r['Item barcode'].trim();
      loan.userBarcode = r['User barcode'].trim();
      let odate = r['Charge datetime'].replace(/(\d{4})(\d\d)(\d\d)(\d\d)(\d\d)/, '$1-$2-$3T$4:$5:00');
      let os = dateOffset(odate);
      loan.loanDate = odate + os;
      let ddate = r['Due date/time'].replace(/(\d{4})(\d\d)(\d\d)(\d\d)(\d\d)/, '$1-$2-$3T$4:$5:00');
      os = dateOffset(ddate);
      loan.dueDate = ddate + os;
      let sp = r['Service point'];
      loan.servicePointId = spMap[sp];
      let rc = r['Num renewals'] || '';
      loan.renewalCount = (rc) ? parseInt(rc, 10) : 0;
      let cr = r['Claims returned date'];
      if (r['Proxy barcode']) {
        pcount++;
      }
      if (cr.match(/\d{8}/)) {
        let crdate = cr.replace(/(\d{4})(\d\d)(\d\d)/, '$1-$2-$3T12:00:00');
        let crd = crdate + dateOffset(crdate);
        loan.claimedReturnedDate = crd;
      }
      if (active[loan.userBarcode]) {
        records.checkouts.push(loan);
        if (!active[loan.userBarcode].active) {
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
    console.log('Proxy user loans:', pcount);
  } catch (e) {
    console.error(e);
  }
})();
