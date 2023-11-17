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
      if (idMap[k] && idMap[k] !== ihrid && !seen[ihrid]) {
        console.log(`${k}\t${ihrid}\t${idMap[k]}`);
        seen[ihrid] = 1;
        total++;
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
    idMap[j.barcode] = j.hrid;
  });
  rl.on('close', () => {
    console.log('Done!');
    main();
  });

} catch (e) {
  console.error(e.message);
}
