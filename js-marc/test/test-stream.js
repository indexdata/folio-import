import { parseMarc } from '../js-marc.mjs';
import fs from 'fs';

let rawFile = process.argv[2];

const fileStream = fs.createReadStream(rawFile, { encoding: 'utf8' });
let count = 0;
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
    let mij = parseMarc(r);
    // console.log(mij);
    count++
  })
  
});
fileStream.on('close', () => {
  console.log(count);
});