import { parseMarc } from '../js-marc2.mjs';
import fs from 'fs';
import path from 'path';

let rawFile = process.argv[2];
let query = process.argv[3];

try {
  if (!rawFile) { throw "Usage: node marcRead <raw_marc_file> <query>" }
  const q = {};
  if (query) {
    let p = query.split(/=/);
    q.tag = p[0].substring(0, 3);
    q.sub = p[0].substring(3, 4);
    q.search = p[1];
  }
  // throw(q);

  let start = new Date().valueOf();

  let dir = path.dirname(rawFile);
  let fn = path.basename(rawFile);

  let count = 0;
  let found = 0;
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
      count++;
      let run = true;
      if (q.search) {
        let rexp = new RegExp(q.search, 'i');
        if (!r.match(rexp)) run = false;
      } 
      if (run) {
        let m = parseMarc(r, true);
        console.log(m.fields);
        if (m.fields[q.tag]) {
          console.log(m.text + '\n');
          found++;
        } 
      }
    });
  });
  fileStream.on('close', () => {
    let now = new Date().valueOf();
    let t = (now - start) / 1000;
    console.warn('--------------------');
    console.warn('Records processed', count, `${t} secs.`);
    if (query) console.warn(`Records found for "${query}"`, found);
  });
} catch (e) {
  console.log(e);
}
