import { parseMarc } from '../js-marc.mjs';
import { getSubs } from '../js-marc.mjs';
import fs from 'fs';

let refDir = process.argv[2];
let rulesFile = process.argv[3];
let rawFile = process.argv[4];
let limitTag = process.argv[5] || '';
const schemaDir = './schemas';
let ldr = '';
const refData = {};

const modeMap = {
 a: 'single unit',
 m: 'multipart monograph',
 s: 'serial',
 i: 'integrating resource'
};

const funcs = {
  remove_prefix_by_indicator: function(data, params, ind1, ind2) {
    let n = parseInt(ind2, 10);
    return data.substring(n);
  },
  capitalize: function (data) {
    let fl = data.charAt(0);
    let upfl = fl.toUpperCase();
    data = data.replace(/^./, upfl);
    return(data);
  },
  char_select: function (data, param) {
    let out = data.substring(param.from, param.to);
    return out;
  },
  set_issuance_mode_id: function () {
    let c = ldr.substring(6,7);
    let cstr = modeMap[c] || 'unspecified';
    let out = refData.issuanceModes[cstr];
    return out;
  },
  set_instance_type_id: function (data, param) {
    let c = data;
    let u = param.unspecifiedInstanceTypeCode;
    let out = refData.instanceTypes[c] || refData.instanceTypes[u]; 
    return out
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
  let rule = (ent.rules) ? ent.rules[0] : ''; 
  if (rule && rule.conditions[0]) {
    let con = rule.conditions[0];
    let ctype = con.type;
    let param = con.parameter || '';
    ctype.split(/, */).forEach(c => {
      if (funcs[c]) {
        data = funcs[c](data, param, field.ind1, field.ind2);
      }
    });
  }
  if (rule && rule.value) data = rule.value;
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
    console.log(JSON.stringify(m, null, 2));
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
  refFiles.forEach(f => {
    let fullPath = refDir + '/' + f;
    try {
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
    } catch {}
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
        if (t.match(limitTag) && marc.fields[t]) {
          let fields = marc.fields[t];
          if (fields) {
            fields.forEach(f => {
              let ff = makeInst(mappingRules[t], f);
              for (let prop in ff) {
                console.log(propMap[prop]);
                if (propMap[prop] === 'string' || propMap[prop] === 'boolean') {
                  inst[prop] = ff[prop].data;
                }
                if (propMap[prop] === 'array.string') {
                  if (!inst[prop]) inst[prop] = [];
                  inst[prop].push(ff[prop].data);
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