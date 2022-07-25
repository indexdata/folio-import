import { makeMij } from '../js-marc.mjs';
import { getFields } from '../js-marc.mjs';
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
    let mij = makeMij(r);
    // fs.writeFileSync('../data/raw.mrc', r, { flag: 'a' });
    // console.log(mij);
    // let fields = getFields(mij);
    // console.log(fields);
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