import { parseMarc } from '../js-marc.mjs';
import fs from 'fs';
import path from 'path';

let rawFile = process.argv[2];

try {
  if (!rawFile) { throw "Usage: node marcRead <raw_marc_file>" }

  let start = new Date().valueOf();

  let dir = path.dirname(rawFile);
  let fn = path.basename(rawFile);

  let count = 0;
  const fileStream = fs.createReadStream(rawFile, { encoding: 'utf8' });
  
  let leftOvers = '';
  fileStream.on('data', (chunk) => {
    let recs = chunk.match(/.*?\x1D|.+$/sg);
    recs[0] = leftOvers + recs[0];
    let lastRec = recs[recs.length - 1];
    if (!lastRec.match(/\x1D/)) {
      leftOvers = lastRec;
      recs.pop();
    } else {
      leftOvers = '';
    }
    recs.forEach(r => {
      let m = parseMarc(r);
      let ldr = m.fields.leader;
      delete m.fields.leader;
      let l = ldr + '\n';
      Object.keys(m.fields).sort().forEach(t => {
        let f = m.fields[t];
        f.forEach(tf => {
          l += t + ' ';
          if (tf.ind1) l += tf.ind1 + tf.ind2;
          let s = tf.subfields;
          if (s) {
            s.forEach(d => {
              Object.keys(d).forEach(c => {
                l += ` \$${c} ${d[c]}`;
              });
            });
            l += '\n';
          } else {
            l += tf + '\n';
          }
          console.log(l);
        });
      });
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
