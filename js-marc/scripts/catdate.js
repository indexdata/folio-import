import { parseMarc } from '../new-js-marc.mjs';
import { getSubs } from '../new-js-marc.mjs';
import fs from 'fs';
import path from 'path';

let rawFile = process.argv[2];
const schemaDir = './schemas';
let ldr = '';

try {
  if (!rawFile) { throw "Usage: node catdata.js <raw_marc_file>" }

  let start = new Date().valueOf();

  let dir = path.dirname(rawFile);
  let fn = path.basename(rawFile);
  let outFile = `${dir}/${fn}-catdates.jsonl`;
  if (fs.existsSync(outFile)) fs.unlinkSync(outFile);

  const fileStream = fs.createReadStream(rawFile, { encoding: 'utf8' });
  let count = 0;
  let t;
  let leftOvers = '';
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
      let marc = parseMarc(r);
      let f907 = marc.fields['907'];
      let hrid = (f907) ? getSubs(f907[0], 'a') : '';
      hrid = hrid.replace(/^.(.+).$/, '$1');
      let f998 = marc.fields['998'];
      let cdate = (f998) ? getSubs(f998[0], 'b') : '';
      let dmy = cdate.split(/-/);
      let dd = dmy[1];
      let mm = dmy[0];
      let yr = dmy[2];
      if (yr && yr.match(/^[012]/)) {
        yr = '20' + yr;
      } else if (yr) {
        yr = '19' + yr;
      }
      if (hrid) out.hrid = hrid;
      if (yr) out.catalogedDate = `${yr}-${mm}-${dd}`;
      let outStr = JSON.stringify(out);
      if (hrid) fs.writeFileSync(outFile, outStr + '\n', {flag: 'a'});

      if (process.env.DEBUG) console.log(outStr);

      if (count % 10000 === 0) {
        let now = new Date().valueOf();
        t = (now - start) / 1000;
        console.log('Records processed', count, `${t} secs.`);
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