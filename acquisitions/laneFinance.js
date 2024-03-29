/*
  This script creates fund-types, fiscal-years and ledgers from CSV files.
  NOTE: This script may not need to be run if these tables are already populated as ref data.
        In this case, move onto laneFunds.js
*/

const fs = require('fs');
const uuid = require('uuid/v5');
const parse = require('csv-parse/lib/sync');

const ns = 'e35dff4e-9035-4d6a-b621-3d42578f81c7';

let files = {
  types: 'fund-types.jsonl',
  fy: 'fiscal-years.jsonl',
  ledgers: 'ledgers.jsonl',
};

let ttl = {
  types: 0,
  fy: 0,
  ledgers: 0
}

let refFiles = {
  acquisitionsUnits: 'units.json'
};

(async () => {
  try {
    let refDir = process.argv[2];
    let dir = process.argv[3];
    if (!dir) {
      throw 'Usage: node laneFinance.js <acq_ref_dir> <finance_dir>';
    } 
    dir = dir.replace(/\/$/, '');
    refDir = refDir.replace(/\/$/, '');

    const writeObj = (fn, data) => {
      const jsonStr = JSON.stringify(data);
      fs.writeFileSync(fn, jsonStr + '\n', { flag: 'a' });
    }
    
    for (let f in files) {
      let file = dir + '/' + files[f];
      if (fs.existsSync(file)) fs.unlinkSync(file);
      files[f] = file;
    }

    const refData = {};
    for (let prop in refFiles) {
      let rfile = refDir + '/' + refFiles[prop];
      let ref = require(rfile);
      refData[prop] = {};
      ref[prop].forEach(p => {
        refData[prop][p.name] = p.id
      });
    }
    const unit = refData.acquisitionsUnits.Lane;
    let fyId = '';

    for (let f in files) {
      let outFile = files[f];
      let inFile = outFile.replace(/\.jsonl$/, '.csv');
      console.log(inFile);
      let csv = fs.readFileSync(inFile, 'utf8');
      csv = csv.replace(/^\uFEFF/, ''); // remove BOM
      inRecs = parse(csv, {
        columns: true,
        skip_empty_lines: true
      });

      inRecs.forEach(r => {
        console.log(r);
        let obj = {};
        if (f === 'types') {
          let name = r['Fund types'];
          obj.id = uuid(name, ns);
          obj.name = name.trim();
        } else if (f === 'fy') {
          obj.id = uuid(r.code, ns);
          obj.name = r.name;
          obj.code = r.code;
          obj.periodStart = r.periodStart.replace(/ .+$/, '');
          obj.periodEnd = r.periodEnd.replace(/ .+$/, '');
          obj.acqUnitIds = [ unit ];
          fyId = obj.id;
        } else if (f === 'ledgers') {
          obj.id = uuid(r.code, ns);
          obj.code = r.code;
          obj.name = r.name;
          obj.fiscalYearOneId = fyId;
          obj.ledgerStatus = 'Active';
          obj.restrictEncumbrance = false;
          obj.restrictExpenditures = false;
          obj.acqUnitIds = [ unit ];
        }
        ttl[f]++;
        writeObj(outFile, obj);
      });
    }
    console.log('Done!');
    console.log('Fund types:', ttl.types);
    console.log('Fiscal years:', ttl.fy);
    console.log('Ledgers:', ttl.ledgers);
  } catch (e) {
    console.log(e);
  }
})();