import { parseMarc, getSubs, mij2raw, fields2mij, getSubsHash } from '../js-marc/js-marc.mjs';
import fs, { unlink } from 'fs';
import path from 'path';
const rawFile = process.argv[2];
let matchTag = process.argv[3] || '001';
let dateTag = process.argv[4] || '005';

try {
  if (!rawFile) { throw "Usage: node dedupeMarc.js <raw_marc_file> [ <match_tag[subfield]> ] [ <date_tag[subfield]> ]" }
  const fileStream = fs.createReadStream(rawFile, { encoding: 'utf8' });
  let dir = path.dirname(rawFile);
  let base = path.basename(rawFile, '.mrc');
  let outFile = `${dir}/${base}-deduped.mrc`;
  if (fs.existsSync(outFile)) fs.unlinkSync(outFile);
  
  const parseTag = (tag) => {
    const m = tag.match(/(...)(.?)/);
    const out = { t: m[1], s: m[2] };
    return out;
  }

  const tagData = (marc, tagObj) => {
    const f = marc.fields[tagObj.t];
    let out = '';
    if (f) {
      if (tagObj.s) {
        out = getSubs(f[0], tagObj.s);
      } else {
        out = f[0];
      }
    }
    return out;
  }

  let mtag = parseTag(matchTag);
  let dtag = parseTag(dateTag);
  const pile = {};

  const ttl = { count: 0 };
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
    for (let k = 0; k < recs.length; k++) {
      let r = recs[k];
      ttl.count++
      let rec = {};
      let marc = {};
      try { 
        marc = parseMarc(r);
      } catch(e) {
        console.log(e);
        continue;
      }
      if (ttl.count % 10000 === 0) {
        console.log('Records processed', ttl.count);
      }
      let m = tagData(marc, mtag);
      let d = tagData(marc, dtag);
      // if (d) d = parseInt(d, 10);
      if (m) {
        m = m.trim();
      } else {
        m = 'x' + ttl.count.toString().padStart(12, '0');
      }
      let o = { d: d, m: r };
      if (pile[m] && pile[m].d < d) {
        pile[m] = o;
      } else if (!pile[m]) {
        pile[m] = o;
      }
      
    };
  });
  fileStream.on('close', () => {
    console.log('Done!')
    let dc = 0;
    for (let k in pile) {
      let r = pile[k].m;
      fs.writeFileSync(outFile, r, { flag: 'a' });
      dc++;
    }
    console.log('Records in :', ttl.count);
    console.log('Records out:', dc);
    console.log('Saved to:', outFile);
  });
} catch (e) {
  console.log(e);
}