const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { callbackify } = require('util');

const mapFile = process.argv[2];
const tsvFile = process.argv[3];

(async () => {
  try {
    if (!tsvFile) throw('Usage: node cubSudocFix.js <map_file_jsonl> <tsv_file>');
    
    const dir = path.dirname(tsvFile);
    const fn = path.basename(tsvFile, '.tsv');
    const outFile = `${dir}/${fn}_sudocs.jsonl`;
    if (fs.existsSync(outFile)) fs.unlinkSync(outFile);

    let fileStream = fs.createReadStream(mapFile);
    let rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

    const cnMap = {};
    console.log(`Reading ${mapFile}...`);
    for await (const line of rl) {
      let j = JSON.parse(line);
      cnMap[j.hrid] = j.callno;
    }
    
    fileStream = fs.createReadStream(tsvFile);
    rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });
    let ttl = 0;
    for await (const line of rl) {
      ttl++
      let c = line.split(/\t/);
      let hid = c[0];
      let bid = c[1];
      let cn = cnMap[bid];
      if (cn) {
        out = {
          id: hid,
          cn: cn
        }
        if (process.env.DEBUG) console.log(out);
        fs.writeFileSync(outFile, JSON.stringify(out) + '\n', { flag: 'a' });
      } else {
        console.log(`No call number found for ${bid}`);
      }
    }
    console.log('Lines read:', ttl);
  } catch (e) {
    console.error(e);
  }
})();