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
      let ihrid = j.hrid.replace(/-.+$/, '');
      if (idMap[k]) {
        let imap = idMap[k];
        let found = 0;
        imap.forEach(i => {
          if (i === ihrid) found++;
        })
        if (!found > 0) {
          console.log(`${k}\t${ihrid}`);
          total++;
        }
      }
    });
    rl.on('close', () => {
      console.log('Done!');
      console.log('Found', total);
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
    bcs.forEach(b => {
      if (!idMap[b]) idMap[b] = [];
      idMap[b].push(j.hrid);
    });
  });
  rl.on('close', () => {
    console.log('Done!');
    main();
  });

} catch (e) {
  console.error(e.message);
}
