/*
  Read CSV funds file for Holy Cross and output finance objects
*/

const parse = require('csv-parse/lib/sync');
const fs = require('fs');
const path = require('path');
const uuid = require('uuid/v5');
const argv = require('minimist')(process.argv.slice(2));

const ns = 'b64efe60-be13-4625-b509-c9654f56af9e';
const fiscalYear = 'FY2021';
const ledger = 'HCLedger';
const unit = 'Acquisitions';

let files = {
  units: 'acq-units.jsonl',
  fy: 'fiscal-years.jsonl',
  ledgers: 'ledgers.jsonl',
  funds: 'funds.jsonl',
  budgets: 'budgets.jsonl'
};

(async () => {
  try {
    const inFile = argv._[1];
    let refDir = argv._[0];
    if (!inFile) {
      throw 'Usage: node hcFinance.js <ref_dir> <funds_csv_file>';
    } else if (!fs.existsSync(inFile)) {
      throw new Error('Can\'t find input file');
    }
    refDir = refDir.replace(/\/$/, '');

    const writeObj = (fn, data) => {
      const jsonStr = JSON.stringify(data);
      fs.writeFileSync(fn, jsonStr + '\n', { flag: 'a' });
    }
    const dir = path.dirname(inFile);
    
    for (let f in files) {
      let file = dir + '/' + files[f];
      if (fs.existsSync(file)) fs.unlinkSync(file);
      files[f] = file;
    }

    let auCount = 0;
    let fyCount = 0;
    let ldCount = 0;
    let fnCount = 0;
    let bdCount = 0;
    let ttl = 0;

    const units = require(`${refDir}/units.json`);
    let unitId = '';
    units.acquisitionsUnits.forEach(d => {
      if (d.name === unit) { 
        unitId = d.id;
        writeObj(files.units, d);
        auCount ++;
      }
    });

    const fys = require(`${refDir}/fiscal-years.json`);
    let fyId = '';
    fys.fiscalYears.forEach(d => {
      if (d.code === fiscalYear) {
        fyId = d.id;
        writeObj(files.fy, d);
        fyCount++;
      }
    });

    const ledgers = require(`${refDir}/ledgers.json`);
    let ledgerId = '';
    ledgers.ledgers.forEach(d => {
      if (d.code === ledger) {
        ledgerId = d.id;
        writeObj(files.ledgers, d);
        ldCount++;
      }
    });

    let csv = fs.readFileSync(inFile, 'utf8');
    let inRecs = parse(csv, {
      columns: true,
      skip_empty_lines: true
    });

    // writeObj(`${dir}/sierra_funds.jsonl`, inRecs);

    // Create funds and budgets objects;
    let seen = {};
    inRecs.forEach(r => {
      ttl++;
      let code = r.fund_code;
      let id = uuid(code, ns);
      if (!seen[code]) {
        let fr = {
          id: id,
          code: code,
          name: r.name,
          fundStatus: 'Active',
          ledgerId: ledgerId,
          acqUnitIds: [ unitId ]
        }
        writeObj(files.funds, fr);
        fnCount++;

        // make budget
        let budgetName = `${code}-${fiscalYear}`;
        let budgetId = uuid(budgetName, ns);
        let bd = {
          id: budgetId,
          name: budgetName,
          fundId: id,
          fiscalYearId: fyId,
          budgetStatus: 'Active',
          acqUnitIds: [ unitId ]
        }
        bd.initialAllocation = parseInt(r.appropriation, 10) / 10;
        bd.expenditures = parseInt(r.expenditure, 10) / 10;
        bd.encumbered = parseInt(r.encumbrance, 10) / 10;
        
        writeObj(files.budgets, bd);
        bdCount++;

      } else {
        // console.log(`WARN Duplicate fund code "${code}"`);
      }
      seen[code] = 1;
    });

    console.log('---------------------');
    console.log('Lines Proc:', ttl);
    console.log('Acq Units :', auCount);
    console.log('Fiscal Yrs:', fyCount);
    console.log('Ledgers   :', ldCount);
    console.log('Funds     :', fnCount);
    console.log('Budgets   :', bdCount); 
  } catch (e) {
    console.log(e);
  }
})();