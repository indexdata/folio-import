import { parseMarc } from '../js-marc.mjs';
import { getSubs } from '../js-marc.mjs';
import fs from 'fs';

let rulesFile = process.argv[2];
let rawFile = process.argv[3];
const schemaDir = './schemas';

const funcs = {
  remove_prefix_by_indicator: function(data) {
    console.log(data);
  },
  capitalize: function (data) {
    console.log(data);
  }
}

const makeInst = function (map, field) {
  let ff = {};
  // console.log(JSON.stringify(map, null, 2));
  map.forEach(m => {
    let subcodes = m.subfield.join('');
    let data = getSubs(field, subcodes);
    if (m.rules && m.rules[0].conditions) {
      let ctype = m.rules[0].conditions[0].type;
      ctype.split(/, */).forEach(c => {
        funcs[c](data);
      });
    }
    ff[m.target] = data;
  });
  return ff;
}

try {
  if (!rawFile) { throw "Usage: node marc2inst.js <mapping_rules> <raw_marc_file>" }
  let rulesStr = fs.readFileSync(rulesFile, { encoding: 'utf8' });
  const mappingRules = JSON.parse(rulesStr);
  rulesStr = '';

  // get instance schema
  let insFile = `${schemaDir}/instance.json`;
  let insStr = fs.readFileSync(insFile, { encoding: 'utf8'});
  let ins = JSON.parse(insStr);
  let propMap = {};
  for (let props in ins.properties) {
    let type = ins.properties[props].type;
    let items = (ins.properties[props].items) ? ins.properties[props].items.type : '';
    propMap[props] = (type === 'array') ? `${type}.${items}` : type;
  }

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
              let ff = makeInst(mappingRules[t], f);
              for (let prop in ff) {
                if (propMap[prop] === 'string' || propMap[prop] === 'boolean') {
                  inst[prop] = ff[prop];
                }
              }
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