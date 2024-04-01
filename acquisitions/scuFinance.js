/*
  Read funds.csv and budgets.csv and output finance objects.
  The csv files must be in the same directory.
*/

const parse = require('csv-parse/lib/sync');
const fs = require('fs');
const uuid = require('uuid/v5');
const argv = require('minimist')(process.argv.slice(2));

const ns = '2f3468f1-8435-4c0b-bf60-4d01dc46a904';
const fiscalYear = 'ULIBFY2025';
const ledger = 'TULIB';
const unit = 'University Library';

let files = {
  funds: 'funds.jsonl',
  budgets: 'budgets.jsonl'
};

let inFiles = {
  funds: 'funds.csv',
  budgets: 'budgets.csv'
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
    let ttl = 0;

    const units = require(`${refDir}/units.json`);
    let unitId = '';
    units.acquisitionsUnits.forEach(d => {
      if (d.name === unit) { 
        unitId = d.id;
      }
    });

    const ftypes = require(`${refDir}/fund-types.json`);
    const typesMap = {};
    ftypes.fundTypes.forEach(d => {
      typesMap[d.name] = d.id;
    });
    // console.log(typesMap); return;

    const fys = require(`${refDir}/fiscal-years.json`);
    let fyId = '';
    fys.fiscalYears.forEach(d => {
      if (d.code === fiscalYear) {
        fyId = d.id;
      }
    });
    // console.log(fyId); return;

    const ledgers = require(`${refDir}/ledgers.json`);
    let ledgerId = '';
    ledgers.ledgers.forEach(d => {
      if (d.code === ledger) {
        ledgerId = d.id;
      }
    });
    // console.log(ledgerId); return;

    let csv = fs.readFileSync(inFiles.budgets, 'utf8');
    let inRecs = parse(csv, {
      columns: true,
      skip_empty_lines: true
    });
    const budMap = {};
    inRecs.forEach(r => {
      let k = r['Fund*'].toLowerCase(); ;
      let v = r['Allocation*'].replace(/[$,]/g, '');
      budMap[k] = v;
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
      console.log(r);
      ttl++;
      let code = r['Code*'];
      let ft = r['Fund type'];
      let extAcc = r['External account*'];
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
          let budgetName = `${code}-${fiscalYear}`;
          let budgetId = uuid(budgetName, ns);
          let bd = {
            id: budgetId,
            name: budgetName,
            fundId: id,
            fiscalYearId: fyId,
            budgetStatus: 'Active',
            acqUnitIds: [ unitId ],
            initialAllocation: 0
          };
          bd.allocated = parseFloat(a);
        
          writeObj(files.budgets, bd);
          bdCount++;

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
  } catch (e) {
    console.log(e);
  }
})();