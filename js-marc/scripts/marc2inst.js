import { parseMarc, getSubs, mij2raw } from '../js-marc.mjs';
import fs, { write } from 'fs';
import path from 'path';
import { v5 as uuid } from 'uuid';

let refDir = process.argv[2];
let rulesFile = process.argv[3];
let rawFile = process.argv[4];
let limitTag = process.argv[5] || '';
const schemaDir = './schemas';
let ldr = '';
const ns = '32a34762-7098-4e19-b1f5-710ce76bd41f';
const refData = {};

const modeMap = {
 a: 'single unit',
 m: 'multipart monograph',
 s: 'serial',
 i: 'integrating resource'
};

const elRelMap = {
  '0':'Resource',
  '1':'Version of resource',
  '2':'Related resource',
  '3':'No information provided',
  '8':'No display constant generated'
}

const files = {
  instances: 1,
  srs: 1,
  snapshot: 1,
  presuc: 1,
  raw: 1
};

const writeOut = (fileName, data) => {
  let dataStr = JSON.stringify(data) + '\n';
  fs.writeFileSync(fileName, dataStr, { flag: 'a' })
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
  },
  set_alternative_title_type_id: function (data, param) {
    return refData.alternativeTitleTypes[param.name];
  },
  set_note_type_id: function (data, param) {
    return refData.instanceNoteTypes[param.name];
  },
  set_electronic_access_relations_id: function (data, param, ind1, ind2) {
    let relStr = elRelMap[ind2] || 'Resource';
    return refData.electronicAccessRelationships[relStr];
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

const makeSrs = function (raw, jobId, bid, hrid) {
  const id = uuid(bid, ns);
  raw.mij.fields.push({'999': {ind1: 'f', ind2: 'f', subfields: [{i: bid}, {s: id}] } })
  const srs = {
    id: id,
    snapshotId: jobId,
    matchedId: id,
    generation: 0,
    recordType: 'MARC_BIB',
    rawRecord: {
      id: id,
      content: raw.rec
    },
    parsedRecord: {
      id: id,
      content: raw.mij
    }
  }
  return(srs);
}

const makeSnap = function () {
  const now = new Date().toISOString();
  const id = uuid(now, ns);
  const so = {
    jobExecutionId: id,
    status: 'COMMITTED',
    processingStartedDate: now
  }
  return (so);
}

try {
  if (!rawFile) { throw "Usage: node marc2inst.js <ref_dir> <mapping_rules> <raw_marc_file>" }
  let wdir = path.dirname(rawFile);
  let fn = path.basename(rawFile, '.mrc');
  let outBase = wdir + '/' + fn;
  for (let f in files) {
    let p = (f === 'raw') ? outBase + '-' + f + '.raw' : outBase + '-' + f + '.jsonl';
    files[f] = p;
    if (fs.existsSync(p)) fs.unlinkSync(p);
  };
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
  let snap = makeSnap();
  writeOut(files.snapshot, snap);
  let jobId = snap.jobExecutionId;

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
      // console.log(JSON.stringify(marc, null, 2));
      marc.mij.fields.push({ 599: { ind1: ' ', ind2: ' ', subfields: [{a: 'Test note'}]} })
      let raw = mij2raw(marc.mij, true);
      // console.log(raw);
      // fs.writeFileSync(files.raw, raw.rec, { flag: 'a' });
      ldr = marc.fields.leader;
      for (let t in marc.fields) {
        if (t.match(limitTag)) {
          let fields = marc.fields[t];
          let mr = mappingRules[t];
          if (mr) {
            fields.forEach(f => {
              let actFields = [];
              if (mr.erps) {
                f.subfields.forEach(a => {
                  actFields.push({ ind1: f.ind1, ind2: f.ind2, subfields: [ a ]});
                });
              } else {
                actFields.push(f);
              }
              actFields.forEach(af => {
                let ff = makeInst(mr, af);
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
            });
          }
        }
      }
      inst.source = 'MARC';
      if (inst.hrid) {
        inst.id = uuid(inst.hrid, ns);
        // console.log(inst);
        writeOut(files.instances, inst);
        let srsObj = makeSrs(raw, jobId, inst.id, inst.hrid);
        writeOut(files.srs, srsObj);
        // console.log(srsObj)
      }

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