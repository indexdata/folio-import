/*
  1. You'll need to download all order titles from /orders-storage/titles and save in JSON line format (use downloadJSON.js to do this.)
  2. This script will read the composite-orders and find the matching title object in the titles file.
*/

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const inFile = process.argv[3];
const tiFile = process.argv[2];

(async () => {
  try {
    if (!inFile) throw('Usage: node setTitlAcknowledge.js <titles.jsonl_file> <composite_orders.jsonl_file>');
    if (!fs.existsSync(inFile)) throw new Error(`Can't find ${inFile}!`);
    
    const dir = path.dirname(inFile);
    const outFile = `${dir}/title_acknowleged.jsonl`;
    if (fs.existsSync(outFile)) fs.unlinkSync(outFile);

    let fileStream = fs.createReadStream(tiFile);
    let rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });
    
    titleMap = {};
    for await (const line of rl) {
      let rec = JSON.parse(line);
      let key = rec.poLineId;
      titleMap[key] = rec;
    }

    fileStream = fs.createReadStream(inFile);
    rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });

    for await (const line of rl) {
      let rec = JSON.parse(line);
      let pol = rec.compositePoLines;
      if (pol) {
        pol.forEach(p => {
          let t = titleMap[p.id];
          if (t) {
            t.isAcknowledged = true;
            tstr = JSON.stringify(t);
            fs.writeFileSync(outFile, tstr + '\n', {flag: 'a'});
          }
        });
      }
    }

  } catch (e) {
    console.error(e);
  }
})();