const fs = require('fs');
const path = require('path');
const parse = require('csv-parse/lib/sync');
const readline = require('readline');

const spFile = process.argv[2];
const usersFile = process.argv[3];
const csvFile = process.argv[4];
const itemsFile = process.argv[5];

(async () => {
  try {
    if (csvFile === undefined) {
      throw('Usage: node hcCheckouts.js <service_points_file> <folio_users_file> <loans_csv_file> [ <items_jsonl_file> ]');
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

    let csv = fs.readFileSync(csvFile, { encoding: 'utf8'});

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

    let itemMap = {};
    if (itemsFile) {
      const fileStream = fs.createReadStream(itemsFile);
      const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
      });
      console.log('Mapping items (this may take awhile)...');
      for await (const l of rl) {
        let i = JSON.parse(l);
        itemMap[i.hrid] = i.barcode;
      }
    }

    // calculate time offset based on time changes 2022
    let dateOffset = (dt) => {
      let m = dt.replace(/^\d{4}-(\d\d).+/, '$1');
      let d = dt.replace(/^\d{4}-\d\d-(\d\d).*/, '$1');
      let testStr = m + d;
      let out = (testStr > '0313' && testStr < '1106') ? '-04:00' : '-05:00';
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
        loan.itemBarcode = r['BARCODE'];
        loan.userBarcode = r['P BARCODE'];
        let odate = r['OUT DATE'].replace(/(\d\d)-(\d\d)-(\d\d\d\d) (.*)/, '$3-$1-$2T$4:00');
        let os = dateOffset(odate);
        loan.loanDate = odate + os;
        let ddate = r['DUE DATE'].replace(/(\d\d)-(\d\d)-(\d\d\d\d)/, '$3-$1-$2T23:59:59')
        os = dateOffset(ddate);
        loan.dueDate = ddate + os;
        loan.servicePointId = spMap['dinand-circ'];
        if (active[r.bbarcode] !== undefined) {
          records.checkouts.push(loan);
          if (active[r['P BARCODE']].active === false) {
            loan.expirationDate = active[r['P BARCODE']].expirationDate;
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
