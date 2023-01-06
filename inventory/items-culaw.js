/*
  This script will create Sierra items objects with item data from an item.csv file
  and map it to the appropriate bib num via found in the bno.csv file.
*/
const parse = require('csv-parse/lib/sync');
const fs = require('fs');
const readline = require('readline');
const path = require('path');

const itemFile = process.argv[2];
const bnoFile = process.argv[3];

(async () => {
  try {
    if (!bnoFile) throw(`Usage: node bibno2item.js <itemfile.csv> <bnofile.csv>`);

    let itemCsv = fs.readFileSync(itemFile, 'utf8');
    itemCsv = itemCsv.replace(/";"/g, '%%');

    const itemRecs = parse(itemCsv, {
      columns: true,
      skip_empty_lines: true
    });

    let dir = path.dirname(bnoFile);
    let outFile = `${dir}/items_with_bno.jsonl`;
    if (fs.existsSync(outFile)) fs.unlinkSync(outFile);

    const fileStream = fs.createReadStream(bnoFile);

    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });

    const imap = {};
    for await (let line of rl) {
      line = line.replace(/^"|"$/g, '');
      let c = line.split(/","/);
      let bnum = c.shift();
      c.forEach(c => {
        if (c.match(/i\d{5}/)) {
          imap[c] = bnum;
        }
      });
    }

    let c = 0;
    let err = 0;
    itemRecs.forEach(i => {
      let iid = i['RECORD #(ITEM)'];
      let bid = imap[iid];
      i.bibId = bid;
      if (bid) {
        let out = JSON.stringify(i);
        fs.writeFileSync(outFile, out + "\n", { flag: 'a'});
        c++;
      } else {
        console.log(`No bib number found for ${iid}`);
        err++;
      }
    });
    console.log('Saved to:', outFile);
    console.log('Items created:', c);
    console.log('Errors:', err);
  } catch (e) {
    console.log(e);
  }
})();
