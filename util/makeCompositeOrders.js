/*
  This script takes a FOLIO purchase order file and FOLIO po-line file and writes composite orders.
  Files must be in JSON line format.
*/

const fs = require('fs');
const readline = require('readline');
const path = require('path');

let poFile = process.argv[2];
let polFile = process.argv[3];

(async () => {
  try {
    const start = new Date().valueOf();
    if (!polFile) {
      throw 'Usage: node makeCompositeOrders.js <po_file_jsonl> <pol_file_jsonl>';
    } 

    const workingDir = path.dirname(poFile);
    const baseName = path.basename(poFile, '.jsonl');
    const outPath = `${workingDir}/composite-${baseName}.jsonl`;
    if (fs.existsSync(outPath)) {
      fs.unlinkSync(outPath);
    }

    lcount = 0;
    pcount = 0;
    
    let fileStream = fs.createReadStream(polFile);

    let rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });

    console.log(`Mapping POL file...`);
    polMap = {};
    for await (const line of rl) {
      let rec = JSON.parse(line);
      let key = rec.purchaseOrderId;
      if (!polMap[key]) polMap[key] = [];
      polMap[key].push(rec);
      lcount++;
    }
  
    fileStream = fs.createReadStream(poFile);
    console.log('Reading PO file...');
    rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });

    for await (const line of rl) {
      let rec = JSON.parse(line);
      let id = rec.id;
      if (polMap[id] !== undefined) {
        rec.compositePoLines = polMap[id];
      } else {
        rec.compositePoLines = [];
      }
      console.log(rec);
      fs.writeFileSync(outPath, JSON.stringify(rec) + "\n", { flag: 'a'});
      pcount++
    }

    console.log('Done!');
    console.log('Polines created: ', lcount);
    console.log('Composite orders: ', pcount);
      
  } catch (e) {
    console.error(e);
  }
})();
