const fs = require('fs');
const readline = require('readline');
const path = require('path');
const uuid = require('uuid/v5');

const ns = 'e35dff4e-9035-4d6a-b621-3d42578f81c7';

(async () => {
  try {
    const inFile = process.argv[2];
    if (!inFile) {
      throw 'Usage: node makeFiscalYear.js <csv_file>';
    } else if (!fs.existsSync(inFile)) {
      throw new Error('Can\'t find input file');
    }
    const writeObj = (fn, data) => {
      const jsonStr = JSON.stringify(data);
      fs.writeFileSync(fn, jsonStr, { flag: 'a' });
    }
    const dir = path.dirname(inFile);

    const unitsFile = dir + '/acq-units.jsonl';
    if (fs.existsSync(unitsFile)) fs.unlinkSync(unitsFile);

    const fyFile = dir + '/fiscal-years.jsonl';
    if (fs.existsSync(fyFile)) fs.unlinkSync(fyFile);

    const fileStream = fs.createReadStream(inFile);

    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });

    let auCount = 0;
    let fyCount = 0;

    const acqUnits = {};
    let x = 0;
    for await (const line of rl) {
      x++;
      if (x > 1) {
        let c = line.split(/\t/);
        let uname = c[1];
        if (uname && !acqUnits[uname]) acqUnits[uname] = uuid(uname, ns);
        let code = c[3];
        let id = uuid(code, ns);
        let start = new Date(c[6]).toISOString();
        let end = new Date(c[7]).toISOString();
        // start = start.replace(/T.+/, 'T00:00:00 -600');
        // end = end.replace(/T.+/, 'T00:00:00 -600');
        let obj = {
          id: id,
          name: c[2],
          code: 'TEST' + c[3],
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
    console.log('---------------------');
    console.log('Acq Units Created:', auCount);
    console.log('Fiscal Yr Created:', fyCount);
  } catch (e) {
    console.log(e);
  }
})();