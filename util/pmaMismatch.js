const fs = require('fs');
const readline = require('readline');
const uuid = require('uuid/v5');
const path = require('path');

let hrids = process.argv[2];
let items = process.argv[3];

const writeJSON = (fn, data) => {
  const out = JSON.stringify(data) + "\n";
  fs.writeFileSync(fn, out, { flag: 'a' });
}

try {
  if (!items) {
    throw new Error('Usage: $ node pmaMismatch.js <bib_hrids_jsonl> <items_jsonl>');
  }

  
  const main = () => {
    let mainFile = items;
    let fileStream = fs.createReadStream(mainFile);
    let rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });

    const seen = {};
    let total = 0;
    rl.on('line', r => {
      let j = JSON.parse(r);
      let k = j.barcode || '';
      let hid = j.holdingsRecordId;
      let ihrid = j.hrid.replace(/-.+$/, '');
      let ti = '';
      let hh = '';
      let id = '';
      if (idMap[k]) {
        let imap = idMap[k];
        // console.log(imap);
        let found = 0;
        imap.forEach(i => {
          ti = i.title;
          hh = i.hasHoldings;
          id = i.id;
          //console.log(i);
          if (i.id === ihrid) { 
            found++;
          }
        })
        if (!found > 0 && !seen[hid]) {
          console.log(`${hid}\t${id}\t${hh}\t${ti}`);
          total++;
          seen[hid] = 1;
        }
      }
    });
    rl.on('close', () => {
      // console.log('Done!');
      // console.log('Found', total);
    });
  }

  let fileStream = fs.createReadStream(hrids);
  let rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  let total = 0;
  let idMap = {};
  rl.on('line', r => {
    total++;
    let j = JSON.parse(r);
    let bcs = j.barcode;
    let ti = j.title;
    let hh = j.hasHoldings;
    bcs.forEach(b => {
      if (!idMap[b]) idMap[b] = [];
      idMap[b].push({id: j.hrid, title: ti, hasHoldings: hh});
    });
  });
  rl.on('close', () => {
    // console.log('Done!');
    main();
  });

} catch (e) {
  console.error(e.message);
}
