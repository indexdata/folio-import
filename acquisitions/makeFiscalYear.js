/*
  TSV Schema:
  0: acqusition unit ID
  1: acqusition unit name
  2: fiscal year name <required>
  3: fiscal year code <required>
  4: 
  5: description
  6: start date <required>
  7: end date <required>
*/

const fs = require('fs');
const readline = require('readline');
const path = require('path');
const uuid = require('uuid/v5');
const argv = require('minimist')(process.argv.slice(2));

console.log(argv);

const ns = 'e35dff4e-9035-4d6a-b621-3d42578f81c7';

(async () => {
  try {
    const inFile = argv._[0];
    if (!inFile) {
      throw 'Usage: node makeFiscalYear.js <tsv_file> [ -l <ledger_tsv_file> ]';
    } else if (!fs.existsSync(inFile)) {
      throw new Error('Can\'t find input file');
    }
    const writeObj = (fn, data) => {
      const jsonStr = JSON.stringify(data);
      fs.writeFileSync(fn, jsonStr + '\n', { flag: 'a' });
    }
    const dir = path.dirname(inFile);

    const unitsFile = dir + '/acq-units.jsonl';
    if (fs.existsSync(unitsFile)) fs.unlinkSync(unitsFile);

    const fyFile = dir + '/fiscal-years.jsonl';
    if (fs.existsSync(fyFile)) fs.unlinkSync(fyFile);

    const ldFile = dir + '/ledgers.jsonl';
    if (fs.existsSync(ldFile)) fs.unlinkSync(ldFile);

    const fileStream = fs.createReadStream(inFile);

    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });

    let auCount = 0;
    let fyCount = 0;
    let ldCount = 0;

    let fyid = '';
    const acqUnits = {};
    let x = 0;
    let sl = 1;
    if (argv.h) sl = 1;
    for await (const line of rl) {
      x++;
      if (x > sl) {
        let c = line.split(/\t/);
        let uname = c[1];
        if (uname && !acqUnits[uname]) acqUnits[uname] = uuid(uname, ns);
        let code = c[3];
        fyid = uuid(code, ns);
        let start = new Date(c[6]).toISOString();
        let end = new Date(c[7]).toISOString();
        let obj = {
          id: fyid,
          name: c[2],
          code: c[3],
          description: c[5],
          periodStart: start,
          periodEnd: end
        }
        if (acqUnits[uname]) {
          obj.acqUnitIds = [ acqUnits[uname] ];
        }
        writeObj(fyFile, obj);
        fyCount++;
      }
    }
    for (let u in acqUnits) {
      let obj = {};
      obj.name = u;
      obj.id = acqUnits[u];
      obj.isDeleted = false;
      writeObj(unitsFile, obj);
      auCount++;
    }
    if (argv.l) {
      const fileStream = fs.createReadStream(argv.l);

      const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
      });
      let x = 0;
      for await (const line of rl) {
        x++;
        if (x > sl) {
          let c = line.split(/\t/);
          let obj = { 
            fiscalYearOneId: fyid,
            name: c[1],
            code: c[2],
            description: c[3],
            ledgerStatus: c[5] || 'Active',
            acqUnitIds: [ acqUnits[c[11]] ],
            restrictEncumbrance: false,
            restrictExpenditures: false
          };
          console.log(obj);
          writeObj(ldFile, obj);
          ldCount++;
        }
      }
    }
    console.log('---------------------');
    console.log('Acq Units Created:', auCount);
    console.log('Fiscal Yr Created:', fyCount);
    console.log('Ledgers Created  :', ldCount);
  } catch (e) {
    console.log(e);
  }
})();