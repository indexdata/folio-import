const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');
const readline = require('readline');

let finesFile = process.argv[2];

let servicePoint = 'ef95b899-be17-450a-bbf5-801c5fb04dbb' // Pecan Library
let priceNote = '1fceb11c-7a89-49d6-8ef0-2a42c58556a2'

const inFiles = { 
  actCost: 'actual-costs.jsonl',
  items: 'items.jsonl',
};

const outFiles = {
  bill: 'bills.jsonl',
  na: 'notAgedToLost.jsonl'
};

(async () => {
  try {
    if (!finesFile) {
      throw('Usage: node stcFines.js <fines_csv_file>');
    }
    let finesDir = path.dirname(finesFile);
    const start = new Date().valueOf();

    for (let k in inFiles) {
      inFiles[k] = finesDir + '/' + inFiles[k];
    }
    inFiles.fines = finesFile;
    // throw(inFiles);

    for (let k in outFiles) {
      outFiles[k] = finesDir + '/' + outFiles[k];
      if (fs.existsSync(outFiles[k])) fs.unlinkSync(outFiles[k]);
    }
    // throw(outFiles);

    // map fines for csv file
    let csv = fs.readFileSync(inFiles.fines, {encoding: 'utf8'});
    const inRecs = parse(csv, {
      columns: true,
      skip_empty_lines: true,
      delimiter: '|',
      trim: true
    });
    let finesMap = {}
    inRecs.forEach(r => {
      let k = 'ui' + r.ITEM_ID;
      if (r.BILL_REASON === 'LOST') finesMap[k] = { bal: r.BALANCE.replace(/(..)$/, '.$1'), rec: r };
    });
    // throw(finesMap);

    let fseen = {};

    // map items
    const items = {};
    let fileStream = fs.createReadStream(inFiles.items);
    let rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });
    for await (let line of rl) {
      let o = JSON.parse(line);
      let k = o.id;
      let hrid = o.hrid;
      if (o.status.name === 'Aged to lost') {
        let fine = finesMap[hrid];
        fseen[hrid] = fine;
        if (items[k]) {
          console.log(`WARN item "${hrid}" has already been billed!`);
        }
        let nts = o.notes;
        items[k] = {};
        if (fine) items[k].bal = fine.bal;
        if (nts) {
          nts.forEach(n => {
            if (n.itemNoteTypeId === priceNote) {
              items[k].amt = n.note;
            } 
          });
        };
      }
    }
    // throw(items);
    // throw(fseen);

    const writeOut = (file, obj) => {
      fs.writeFileSync(file, JSON.stringify(obj) + '\n', { flag: 'a'});
    };

    const ttl = {
      bills: 0,
      notLost: 0,        
      err: 0
    }

    fileStream = fs.createReadStream(inFiles.actCost);
    rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });
    for await (let line of rl) {
      let r = JSON.parse(line);
      let aid = r.id;
      let iid = r.item.id;
      let item = items[iid];
      if (item && r.status === 'Open') {
        let o = {
          actualCostRecordId: aid,
          servicePointId: servicePoint
        }
        if (item.bal && item.bal !== item.amt) {
          o.amount = item.bal;
          o.additionalInfoForStaff = `This is the balance due. (Actual cost: $${item.amt})`;
        } else {
          o.amount = item.amt;
          // o.additionalInfoForStaff = iid;
        }
        o.amount = parseFloat(o.amount);
        if (o.amount > 0) {
          writeOut(outFiles.bill, o);
          ttl.bills++;
        } else {
          console.log(`WARN amount is $0 -- not billing (${iid})`);
          ttl.err++;
        }
      }

    }

    for (k in finesMap) {
      if (!fseen[k]) {
        console.log(`WARN "Aged to lost" status not found for ${k}`);
        writeOut(outFiles.na, finesMap[k].rec);
        ttl.notLost++;
      }
    }

    const end = new Date().valueOf();
    const time = (end - start)/1000;
    console.log('Bills:', ttl.bills);
    console.log('Not aged to lost:', ttl.notLost);
    console.log('Total errors:', ttl.err);
    console.log('Time (sec):', time);
  } catch (e) {
    console.error(e);
  }
})();
