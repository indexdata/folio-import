import { parseMarc } from '../new-js-marc.mjs';
import { getSubs } from '../new-js-marc.mjs';
import fs from 'fs';
import path from 'path';

let rawFile = process.argv[2];

try {
  if (!rawFile) { throw "Usage: node pmaLocs.js <raw_marc_file>" }

  let start = new Date().valueOf();

  let dir = path.dirname(rawFile);
  let fn = path.basename(rawFile);
  let outFile = `${dir}/${fn}-locs.jsonl`;
  if (fs.existsSync(outFile)) fs.unlinkSync(outFile);

  const fileStream = fs.createReadStream(rawFile, { encoding: 'utf8' });
  let count = 0;
  let t;
  let leftOvers = '';
  const lcodeSeen = {};
  const lnameSeen = {};
  fileStream.on('data', (chunk) => {
    let recs = chunk.match(/.+?\x1D|.+$/g);
    recs[0] = leftOvers + recs[0];
    let lastRec = recs[recs.length - 1];
    if (!lastRec.match(/\x1D/)) {
      leftOvers = lastRec;
      recs.pop();
    } else {
      leftOvers = '';
    }
    recs.forEach(r => {
      count++
      let out = {};
      try {
        let marc = parseMarc(r);
        let f930 = marc.fields['930'];
        let lcode = (f930) ? getSubs(f930[0], '2') : '';
        let lname = (f930) ? getSubs(f930[0], 'B') : '';
        if (lcode && lname && !lcodeSeen[lcode] && !lnameSeen[lname]) {
          let out = {};
          out.code = lcode;
          out.name = lname;
          console.log(out);
          lcodeSeen[lcode] = 1;
          lnameSeen[lname] = 1;
          // fs.writeFileSync(outFile, JSON.stringify(out) + '\n', {flag: 'a'});
        }
      } catch (e) {
        console.log(`ERROR [${count}] ${e}`);
      } 
    });
  });
  fileStream.on('close', () => {
    let now = new Date().valueOf();
    let t = (now - start) / 1000;
    console.log('--------------------');
    console.log('Records processed', count, `${t} secs.`);
  });
} catch (e) {
  console.log(e);
}
