import { parseMarc } from '../js-marc.mjs';
import { getSubs } from '../js-marc.mjs';
import fs from 'fs';

let refDir = process.argv[2];
let rulesFile = process.argv[3];
let rawFile = process.argv[4];
const schemaDir = './schemas';
let ldr = '';

const funcs = {
  remove_prefix_by_indicator: function(data, ind1, ind2) {
    let n = parseInt(ind2, 10);
    return data.substring(n);
  },
  capitalize: function (data) {
    let fl = data.charAt(0);
    let upfl = fl.toUpperCase();
    data = data.replace(/^./, upfl);
    return(data);
  },
  set_issuance_mode_id: function (data) {
    return ldr.substring(6,7);
  },
  set_instance_type_id: function (data) {
    return 'MARC'
  }
}

const applyRules = function (ent, field) {
  let data;
  if (ent.subfield && ent.subfield[0]) {
    let subcodes = ent.subfield.join('');
    data = getSubs(field, subcodes);
  } else {
    data = field;
  }
  if (ent.rules && ent.rules[0] && ent.rules[0].conditions[0]) {
    let ctype = ent.rules[0].conditions[0].type;
    ctype.split(/, */).forEach(c => {
      console.log(c);
      if (funcs[c]) {
        data = funcs[c](data, field.ind1, field.ind2);
      }
    });
  }
  const out = {
    prop: ent.target,
    data: data
  }
  return out;
}

const makeInst = function (map, field) {
  let ff = {};
  let data;
  map.forEach(m => {
    console.log(m);
    if (m.entity) {
      m.entity.forEach(e => {
        data = applyRules(e, field);
      })
    } else {
      data = applyRules(m, field);
    }
    ff[data.prop] = data;
  });
  return ff;
}

try {
  if (!rawFile) { throw "Usage: node marc2inst.js <ref_dir> <mapping_rules> <raw_marc_file>" }
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

  // map ref data
  let refFiles = fs.readdirSync(refDir);
  const refData = {};
  refFiles.forEach(f => {
    let fullPath = refDir + '/' + f;
    let rd = fs.readFileSync(fullPath, { encoding: 'utf8'});
    let robj = JSON.parse(rd);
    delete robj.totalRecords;
    let props = Object.keys(robj);
    let prop = props[0];
    robj[prop].forEach(p => {
      if (!refData[prop]) refData[prop] = {};
      if (p.code) {
        refData[prop][p.code] = p.id;
      } else {
        refData[prop][p.name] = p.id;
      }
    });
  });
  // console.log(refData);

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
      ldr = marc.fields.leader;
      for (let t in mappingRules) {
        if (t === '008' && marc.fields[t]) {
          let fields = marc.fields[t];
          if (fields) {
            fields.forEach(f => {
              let ff = makeInst(mappingRules[t], f);
              for (let prop in ff) {
                if (propMap[prop] === 'string' || propMap[prop] === 'boolean') {
                  inst[prop] = ff[prop].data;
                }
              }
            });
          }
        }
      }
      console.log(inst);

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