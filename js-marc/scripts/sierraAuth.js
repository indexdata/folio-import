import { makeMarc } from '../new-js-marc.mjs';
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
    rl.on('line', r => {
      total++;
      let vf = JSON.parse(r).varFields;
      let ldr = '';
      let vfs = [];
      vf.forEach(f => {
        let txt = '';
        if (f.marcTag) {
          if (f.marcTag > '009') {
            txt = `${f.marcTag} ${f.ind1}${f.ind2}`;
            f.subfields.forEach(s => {
              txt += ` $${s.tag} ${s.content}`;
            });
          } else {
            txt = `${f.marcTag} ${f.content}`;
          }
          vfs.push(txt);
        } else if (f.fieldTag && f.fieldTag === '_') {
          ldr = f.content + '\n';
        }
      });
      let out = vfs.sort().join('\n');
      let mrc = makeMarc(out);
      console.log(mrc);
    });
    rl.on('close', () => {
      console.log('Done!');
      console.log('Records created:', total);
    });
} catch (e) {
  console.log(e);
}
