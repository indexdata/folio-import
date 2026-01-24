/*
  Read funds.csv and budgets.csv and output finance objects.
  The csv files must be in the same directory.
*/

const parse = require('csv-parse/lib/sync');
const fs = require('fs');
const uuid = require('uuid/v5');
const argv = require('minimist')(process.argv.slice(2));

const ns = '2f3468f1-8435-4c0b-bf60-4d01dc46a904';

let files = {
  funds: 'funds.jsonl',
  budgets: 'budgets.jsonl',
  exc: 'expense-classes.jsonl'
};

let inFiles = {
  funds: 'funds.csv',
  budgets: 'budgets.csv'
};

const exClasses = {
  Periodical: 1,
  Online: 1,
  Video: 1,
  eBook: 1,
  Automation: 1,
  'Resource Sharing': 1,
  'Binding / Preservation': 1,
  'Print Book (T)': 1
};

(async () => {
  try {
    let refDir = argv._[0];
    let dir = argv._[1];
    if (!dir) {
      throw 'Usage: node scuFinance.js <ref_dir> <finance_dir>';
    } else if (!fs.existsSync(dir)) {
      throw new Error('Can\'t find finance directory!');
    }
    refDir = refDir.replace(/\/$/, '');
    dir = dir.replace(/\/$/, '');

    const writeObj = (fn, data) => {
      const jsonStr = JSON.stringify(data);
      fs.writeFileSync(fn, jsonStr + '\n', { flag: 'a' });
    }

    for (let f in files) {
      let file = dir + '/' + files[f];
      if (fs.existsSync(file)) fs.unlinkSync(file);
      files[f] = file;
    }

    for (let f in inFiles) {
      let file = dir + '/' + inFiles[f];
      inFiles[f] = file;
    }

    let fnCount = 0;
    let bdCount = 0;
    let ecc = 0;
    let ttl = 0;

    const units = require(`${refDir}/units.json`);
    let unitsMap = {};
    units.acquisitionsUnits.forEach(d => {
      unitsMap[d.name] = d.id 
    });
    // console.log(unitsMap); return;

    const ftypes = require(`${refDir}/fund-types.json`);
    const typesMap = {};
    ftypes.fundTypes.forEach(d => {
      typesMap[d.name] = d.id;
    });
    // console.log(typesMap); return;

    const fys = require(`${refDir}/fiscal-years.json`);
    let fyMap = {};
    fys.fiscalYears.forEach(d => {
      fyMap[d.code] = d.id;
    });
    // console.log(fyMap); return;

    const ledgers = require(`${refDir}/ledgers.json`);
    let ledgerMap = {};
    ledgers.ledgers.forEach(d => {
      ledgerMap[d.code] = d.id;
    });
    // console.log(ledgerMap); return;

    const exc = require(`${refDir}/expense-classes.json`);
    let excMap = {};
    exc.expenseClasses.forEach(d => {
      if (exClasses[d.name]) excMap[d.name] = d.id;
    });
    // console.log(excMap); return;

    let csv = fs.readFileSync(inFiles.budgets, 'utf8');
    let inRecs = parse(csv, {
      columns: true,
      skip_empty_lines: true
    });
    const budMap = {};
    inRecs.forEach(r => {
      let k = r['Fund*'].toLowerCase(); ;
      r['Allocation*'] = r['Allocation*'].replace(/[$,]/g, '');
      budMap[k] = r;
    });
    // console.log(budMap); return;

    csv = fs.readFileSync(inFiles.funds, 'utf8');
    inRecs = parse(csv, {
      columns: true,
      skip_empty_lines: true
    });

    // Create funds and budgets objects;
    let seen = {};
    inRecs.forEach(r => {
      ttl++;
      let code = r['Code*'];
      let ft = r['Fund type'];
      let extAcc = r['External account*'];
      let unit = r['Acquisitions unit'];
      let lcode = (unit === 'Law Library') ? 'LL' : 'ULIB';
      let ledgerId = ledgerMap[lcode];
      let unitId = unitsMap[unit];
      let id = uuid(code, ns);
      if (code && !seen[code]) {
        let fr = {
          id: id,
          code: code,
          name: r['Name*'],
          fundStatus: 'Active',
          ledgerId: ledgerId,
          acqUnitIds: [ unitId ],
        }
        let fundTypeId = typesMap[ft];
        if (fundTypeId) fr.fundTypeId = fundTypeId;
        if (extAcc) fr.externalAccountNo = extAcc;
        writeObj(files.funds, fr);
        fnCount++;

        // make budget
        let a = budMap[code];
        if (a) {
          let budgetName = a['Name*'];
          let fy = a['Fiscal year*'];
          let budgetId = uuid(budgetName, ns);
          let fyId = fyMap[fy];
          let bd = {
            id: budgetId,
            name: budgetName,
            fundId: id,
            fiscalYearId: fyId,
            budgetStatus: 'Active',
            acqUnitIds: [ unitId ],
            initialAllocation: 0
          };
          bd.allocated = parseFloat(a['Allocation*']);
          writeObj(files.budgets, bd);
          bdCount++;

          // create expense classes
          for (let k in excMap) {
            let eid = excMap[k];
            let o = {
              _version: 1,
              id: uuid(eid + budgetId, ns),
              budgetId: budgetId,
              expenseClassId: eid,
              status: 'Active'
            }
            writeObj(files.exc, o);
            ecc++;
          }
        }
      } else {
        console.log(`WARN Duplicate fund code "${code}"`);
      }
      seen[code] = 1;
    });

    console.log('---------------------');
    console.log('Lines Proc:', ttl);
    console.log('Funds     :', fnCount);
    console.log('Budgets   :', bdCount);
    console.log('Ex classes:', ecc);
  } catch (e) {
    console.log(e);
  }
})();