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
  },
  set_instance_format_id: function (data) {
    return refData.instanceFormats[data] || refData.instanceFormats.zu;
  },
  set_contributor_name_type_id: function (data, param) {
    return refData.contributorNameTypes[param.name] || refData.contributorNameTypes['Personal name'];
  },
  set_contributor_type_id_by_code_or_name: function (data, param) {
    data = data.toLowerCase().trim().replace(/[,.]/g, '');
    return refData.contributorTypes[data] || refData.contributorTypes['author'];
  },
  set_classification_type_id: function (data, param) {
    return refData.classificationTypes[param.name] || 'ERROR';
  },
  set_identifier_type_id_by_value: function (data, param) {
    let type = '';
    if (data.match(param.oclc_regex)) {
      type = refData.identifierTypes.OCLC;
    }
    return type;
  },
  set_identifier_type_id_by_name: function (data, param) {
    return refData.identifierTypes[param.name];
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
  if (data && rule && rule.conditions[0]) {
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
  let fsubs = field.subfields;
  let subs = {};
  let ents = map.entities;
  if (fsubs) {
    fsubs.forEach(s => {
      subs[Object.keys(s)[0]] = 1;
    });
  }
  let erps = map.erps;
  ents.forEach(e => {
    let ar = false;
    if (e.subfield && e.subfield[0]) {
      for (let x = 0; x < e.subfield.length; x++) {
        let s = e.subfield[x];
        if (subs[s]) {
          ar = true;
          break;
        }
      }
    } else {
      ar = true;
    }
    if (ar) {
      data = applyRules(e, field, erps);
      ff[data.prop] = data;
    }
  });
  return ff;
}

try {
  if (!rawFile) { throw "Usage: node marc2inst.js <ref_dir> <mapping_rules> <raw_marc_file>" }
  let rulesStr = fs.readFileSync(rulesFile, { encoding: 'utf8' });
  const allMappingRules = JSON.parse(rulesStr);
  const mappingRules = {};
  for (let tag in allMappingRules) {
    let map = allMappingRules[tag];
    const ents = [];
    let erps = false;
    map.forEach(m => {
      if (m.entityPerRepeatedSubfield) erps = true;
      if (m.entity) {
        m.entity.forEach(e => {
          ents.push(e)
        });
      } else {
        ents.push(m);
      }
    });
    mappingRules[tag] = {};
    mappingRules[tag].erps = erps;
    mappingRules[tag].entities = ents;
  }
  // console.log(mr);
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
        } 
        if (p.name) {
          refData[prop][p.name] = p.id;
        }
      });
    } catch {}
  });
  // console.log(refData.identifierTypes);

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
      for (let t in marc.fields) {
        if (t.match(limitTag)) {
          let fields = marc.fields[t];
          let mr = mappingRules[t];
          if (mr) {
            fields.forEach(f => {
              let ff = makeInst(mr, f);
              let obj = {};
              let root = '';
              for (let prop in ff) {
                let [rt, pr] = prop.split('.');
                if (propMap[prop] === 'string' || propMap[prop] === 'boolean') {
                  inst[prop] = ff[prop].data;
                } else if (propMap[prop] === 'array.string') {
                  if (!inst[prop]) inst[prop] = [];
                  inst[prop].push(ff[prop].data);
                } else if (propMap[rt] === 'array.object') {
                  if (!inst[rt]) inst[rt] = [];
                  obj[pr] = ff[prop].data;
                  root = rt;
                } 
              }
              if (root) {
                if (!inst[root]) inst[root] = [];
                inst[root].push(obj); 
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