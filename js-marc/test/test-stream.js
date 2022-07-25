import { parseMarc } from '../js-marc.mjs';
import { getSubs } from '../js-marc.mjs';
import fs, { rmSync } from 'fs';

let rawFile = process.argv[2];
let start = new Date().valueOf();

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
    let marc = parseMarc(r);
    // console.log(JSON.stringify(marc.fields, null, 2));
    let f245 = marc.fields['245'];
    if (f245) {
      let title = getSubs(f245[0], 'abcpn');
      // console.log(title);
    }
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