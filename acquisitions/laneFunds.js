/*
  This script creates funds and budgets 
*/

const fs = require('fs');
const uuid = require('uuid/v5');
const parse = require('csv-parse/lib/sync');

const ns = 'e35dff4e-9035-4d6a-b621-3d42578f81c7';

let files = {
  funds: 'funds.jsonl',
};

let ttl = {
  funds: 0,
  budgets: 0,
}

let refFiles = {
  acquisitionsUnits: 'units.json',
  fundTypes: 'fund-types.json',
  ledgers: 'ledgers'
};

(async () => {
  try {
    let refDir = process.argv[2];
    let dir = process.argv[3];
    if (!dir) {
      throw 'Usage: node laneFunds.js <acq_ref_dir> <finance_dir>';
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
    // console.log(refData); return;
    const unit = refData.acquisitionsUnits.Lane;
    let fyId = '';

    for (let f in files) {
      let outFile = files[f];
      let inFile = outFile.replace(/\.jsonl$/, '.csv');
      console.log(inFile);
      let csv = fs.readFileSync(inFile, 'utf8');
      inRecs = parse(csv, {
        columns: true,
        skip_empty_lines: true
      });

      inRecs.forEach(r => {
        let obj = {};
        if (f === 'funds') {
          lcode = r['Ledger ID'];
          lid = refData.ledgers[lcode];
          ftype = r.fundType;
          ftypeId = refData.fundTypes[ftype];
          obj.code = r.Code;
          obj.id = uuid(r.Code, ns);
          obj.name = r.Name;
          obj.ledgerId = lid;
          obj.fundStatus = r['Fund status'] || 'Active';
          obj.fundTypeId = ftypeId || ftype;
        }
        console.log(obj);
        ttl[f]++;
        writeObj(outFile, obj);
      });
    }
    console.log('Done...');
    for (t in ttl) {
      console.log(t, ttl[t]);
    }
  } catch (e) {
    console.log(e);
  }
})();