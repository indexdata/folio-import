import { parseMarc, getSubs, fields2mij } from '../js-marc2.mjs';
import fs from 'fs';
import path from 'path';

let bin = false;
let json = false;
for (let x = 0; x < process.argv.length; x++) {
  let a = process.argv[x];
  if (a === '-b' || a === '-j') { 
    process.argv.splice(x, 1);
    if (a === '-b') {
      bin = true;
    } else {
      json = true;
    }
  }
}

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
      let  m;
      if (q.search) {
        let rexp = new RegExp(q.search, 'i');
        let tag = q.tag;
        if (!r.match(rexp)) {
          run = false
        } else {
          m = parseMarc(r, true);
          let farr = m.fields[tag] || [];
          for (let x = 0; x < farr.length; x++) {
            let f = farr[x];
            if (!q.sub) {
              let subs = getSubs(f);
              console.warn(subs);
            }
          }
          
        }
      } else {
        m = parseMarc(r, true); 
      }
      if (run) {
        if (bin) {
          process.stdout.write(r);
        } else if (json) {
          let mij = fields2mij(m.fields);
          console.log(JSON.stringify(mij));
        } else {
          console.log(m.text + '\n');
        }
        found++;
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
