import { parseMarc } from '../js-marc.mjs';
import { getSubs } from '../js-marc.mjs';
import fs from 'fs';

let rulesFile = process.argv[2];
let rawFile = process.argv[3];

const makeInst = function (map, field) {
  let ff = {};
  map.forEach(m => {
    let subcodes = m.subfield.join('');
    let data = getSubs(field, subcodes);
    ff[m.target] = data;
  });
  return ff;
}

try {
  if (!rawFile) { throw "Usage: node marc2inst.js <mapping_rules> <raw_marc_file>" }
  let rulesStr = fs.readFileSync(rulesFile, { encoding: 'utf8' });
  const mappingRules = JSON.parse(rulesStr);
  rulesStr = '';

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
      let inst = {};
      let marc = parseMarc(r);
      for (let t in mappingRules) {
        if (t === '245') {
          let fields = marc.fields[t];
          if (fields) {
            fields.forEach(f => {
              inst = makeInst(mappingRules[t], f);
            });
          }
        }
      }
      // console.log(inst);

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