import { txt2raw } from '../js-marc.mjs';
import fs from 'fs';
import path from 'path';
import readline from 'readline';

let textFile = process.argv[2];

try {
  if (!textFile) { throw "Usage: node makeTest.js <marc_text_file>" }

  let start = new Date().valueOf();

  let dir = path.dirname(textFile);
  let fn = path.basename(textFile);
  let outFile = `${dir}/${fn}.mrc`;
  if (fs.existsSync(outFile)) fs.unlinkSync(outFile);


  let fileStream = fs.createReadStream(textFile);
    let rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });
    let total = 0;
    let trec = '';
    rl.on('line', r => {
      if (r.match(/^\d{3}/)) {
        trec += r + "\n";
      } else {
        let raw = txt2raw(trec);
        fs.writeFileSync(outFile, raw, {flag: 'a'});
        trec = '';
        total++;
      }
    });
    rl.on('close', () => {
      console.log('Done!');
      console.log('Records created:', total);
    });
} catch (e) {
  console.log(e);
}
