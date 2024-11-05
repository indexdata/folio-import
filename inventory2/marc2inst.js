import { parseMarc, getSubs, mij2raw, fields2mij, getSubsHash } from '../js-marc/js-marc.mjs';
import fs from 'fs';
import path from 'path';
import { v5 as uuid } from 'uuid';

let confFile = process.argv[2];

let refDir;
let rulesFile;
let rawFile = process.argv[3];
const schemaDir = './schemas';
let ldr;
let ns;
let iprefix;
const refData = {};
const tsvMap = {};
const outs = {};
const bcseen = {};
const iseen = {};
const seen = {};

const typeMap = {
  'a': 'text',
  'c': 'notated music',
  'd': 'notated music',
  'e': 'cartographic image',
  'f': 'cartographic image',
  'g': 'two-dimensional moving image',
  'i': 'spoken word',
  'j': 'performed music',
  'k': 'still image',
  'm': 'computer program',
  'o': 'other',
  'p': 'other',
  'r': 'three-dimensional form"',
  't': 'text',
}

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
  err: 1
};

const repMap = {
  '100': '700',
  '110': '710',
  '111': '711',
  '245': '246'
};

const pubRoleMap = {
  '0': 'Production',
  '1': 'Publication',
  '2': 'Distribution',
  '3': 'Manufacture',
  '4': 'Copyright notice date'
};

const cnTypeMap = {
  '0': '95467209-6d7b-468b-94df-0f5d7ad2747d',
  '1': '03dd64d0-5626-4ecd-8ece-4531e0069f35',
  '2': '054d460d-d6b9-4469-9e37-7a78a2266655',
  '3': 'fc388041-6cd0-4806-8a74-ebe3b9ab4c6e',
  '4': '28927d76-e097-4f63-8510-e56f2b7a3ad0',
  '5': '5ba6b62e-6858-490a-8102-5b1369873835',
  '6': 'cd70562c-dd0b-42f6-aa80-ce803d24d4a1',
  '7': '827a2b64-cbf5-4296-8545-130876e4dfc0',
  '8': '6caca63e-5651-4db6-9247-3205156e9699'
}

const inotes = [];

const writeOut = (outStream, data, notJson, newLineChar) => {
  let nl = newLineChar || '';
  let dataStr = (notJson !== undefined && notJson) ? data + nl: JSON.stringify(data) + '\n';
  outStream.write(dataStr, 'utf8');
};

const funcs = {
  remove_ending_punc: function (data) {
    data = data.replace(/[;:,/+= ]$/g, '');
    return data;
  },
  remove_prefix_by_indicator: function(data, param, ind1, ind2) {
    let n = parseInt(ind2, 10);
    return data.substring(n);
  },
  remove_substring: function(data, param) {
    let re = new RegExp(param.substring, 'g');
    data = data.replace(re, '');
    return data;
  },
  capitalize: function (data) {
    let fl = data.charAt(0);
    let upfl = fl.toUpperCase();
    data = data.replace(/^./, upfl);
    return data;
  },
  concat_subfields_by_name: function (data, param, ind1, ind2, allFields) {
    let stc = param.subfieldsToConcat.join('');
    let cdata = getSubs(allFields, stc);
    data += (cdata) ? ' ' + cdata : '';
    return data;
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
    let [ n, c ] = data.split(/~/);
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
    } else {
      type = refData.identifierTypes['System control number'];
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
  set_note_staff_only_via_indicator: function (data, param, ind1) {
    if (ind1 === ' ' || ind1 === '0') {
      return true
    } else {
      return false
    }
  },
  set_electronic_access_relations_id: function (data, param, ind1, ind2) {
    let relStr = elRelMap[ind2] || 'Resource';
    return refData.electronicAccessRelationships[relStr];
  },
  set_publisher_role: function (data, param, ind1, ind2) {
    let r = pubRoleMap[ind2];
    return r;
  },
  set_subject_source_id: function (data, param) {
  },
  set_subject_type_id: function (data, param) {
  },
  trim: function (data) {
    data = data.trim();
    return data;
  },
  trim_period: function (data) {
    data = data.replace(/\.$/, '');
    return data;
  }
}

const applyRules = function (ent, field, allFields) {
  let data = '';
  let aoc = ent.applyRulesOnConcatenatedData || false;
  let dls = ent.subFieldDelimiter || '';
  let rule = (ent.rules) ? ent.rules[0] : ''; 
  let funcNames = [];
  let param = '';
  if (rule && rule.conditions[0]) {
    let con = rule.conditions[0];
    let ctype = con.type;
    param = con.parameter;
    funcNames = ctype.split(/, */);
  }
  if (ent.subfield && ent.subfield[0]) {
    let subcodes = ent.subfield.join('');
    if (aoc) {
      if (dls) {
        let dparts = [];
        dls.forEach(d => {
          let dl = d.value;
          let subcodes = d.subfields.join('');
          let part = getSubs(field, subcodes, dl);
          if (part) {
            if (dparts[0]) part = dl + part;
            dparts.push(part);
          }
          data = dparts.join('');
        });
      } else {
        let subcodes = ent.subfield.join('');
        data = getSubs(field, subcodes);
      }
      funcNames.forEach(c => {
        if (funcs[c]) {
          data = funcs[c](data, param, field.ind1, field.ind2, allFields);
        }
      });
    } else {
      if (dls) {
        let dparts = [];
        let parts = getSubsHash(field);
        dls.forEach(d => {
          let dl = d.value;
          d.subfields.forEach(s => {
            if (parts[s]) {
              parts[s].forEach(p => {
                funcNames.forEach(c => {
                  if (funcs[c]) {
                    p = funcs[c](p, param, field.ind1, field.ind2, allFields);
                  }
                });
                if (dparts[0]) p = dl + p;
                dparts.push(p);
              })
            }
          });
        });
        data = dparts.join('');
      } else {
        let parts = getSubs(field, subcodes, -1);
        for (let x = 0; x < parts.length; x++) {
          funcNames.forEach((c) => {
            if (funcs[c]) {
              parts[x] = funcs[c](parts[x], param, field.ind1, field.ind2, allFields);
            }
          });
        };
        data = parts.join(' ');
      }
    }
  } else {
    data = field;
    funcNames.forEach(c => {
      if (funcs[c]) {
        data = funcs[c](data, param, field.ind1, field.ind2, allFields);
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

const makeInst = function (map, field, allFields) {
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
  for (let w = 0; w < ents.length; w++) {
    let e = ents[w];
    let ar = false;
    if (e.inds) {
      let mstr = field.ind1 + field.ind2;
      if (!mstr.match(e.inds)) continue;
    }
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
      data = applyRules(e, field, allFields);
      ff[data.prop] = data;
    }
  }
  return ff;
}

const makeSrs = function (raw, jobId, bid, hrid, suppress) {
  let ldr = raw.mij.leader;
  let lstat = ldr.substring(5, 6);
  if (!lstat.match(/[a|c|d|n|p|o|s|x]/)) lstat = 'c';
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
    },
    externalIdsHolder: {
      instanceId: bid,
      instanceHrid: hrid
    },
    additionalInfo: {
      suppressDiscovery: suppress || false
    },
    state: 'ACTUAL',
    leaderRecordStatus: lstat
  }
  return srs;
}

const makeSnap = function () {
  const now = new Date().toISOString();
  const id = uuid(now, ns);
  const so = {
    jobExecutionId: id,
    status: 'COMMITTED',
    processingStartedDate: now
  }
  return so;
}

const dedupe = function (arr, props) {
  let seen = {};
  let newArr = [];
  arr.forEach(a => {
    let k = '';
    if (props) {
      props.forEach(p => {
        k += '::' + a[p];
      });
    } else {
      k = a;
    }
    if (!seen[k]) newArr.push(a);
    seen[k] = 1;
  });
  return newArr;
}

const makeHoldingsItems = function (fields, bid, bhrid, suppress, ea) {
}

try {
  if (!rawFile) { throw "Usage: node marc2inst.js <conf_file> <raw_marc_file>" }
  let confDir = path.dirname(confFile);
  let confData = fs.readFileSync(confFile, { encoding: 'utf8' });
  let conf = JSON.parse(confData);
  ns = conf.nameSpace;
  refDir = conf.refDir.replace(/^\./, confDir);
  if (conf.mapFile) {
    rulesFile = conf.mapFile.replace(/^\./, confDir);
  } else {
    rulesFile = refDir + '/marc-bib.json';
  }
  const iconf = conf.items;
  const idmap = conf.makeInstMap;
  const mapcn = conf.callNumbers;
  const supp = (conf.suppress.tag) ? conf.suppress : '';
  let prefix = conf.hridPrefix;
  iprefix = (iconf) ? iconf.hridPrefix : '';
  let wdir = path.dirname(rawFile);
  let fn = path.basename(rawFile, '.mrc');
  let outBase = wdir + '/' + fn;
  if (conf.items) {
    files.holdings = 'holdings',
    files.items = 'items'
  }
  if (conf.hasMfhd) {
    files.mfhds = 'mfhds'
  }
  if (idmap) {
    files.idmap = 'map'
  }
  for (let f in files) {
    let p = (f === 'err') ? outBase + '-' + f + '.mrc' : (f === 'idmap') ? outBase + '.map' : outBase + '-' + f + '.jsonl';
    files[f] = p;
    if (fs.existsSync(p)) fs.unlinkSync(p);
    outs[f] = fs.createWriteStream(p)
  };
  let rulesStr = fs.readFileSync(rulesFile, { encoding: 'utf8' });
  const allMappingRules = JSON.parse(rulesStr);
  const mappingRules = {};
  for (let tag in allMappingRules) {
    let map = allMappingRules[tag];
    const ents = [];
    let erps = false;
    map.forEach(m => {
      let indStr = '';
      if (m.indicators) {
        indStr = '^' + m.indicators.ind1 + m.indicators.ind2 + '$';
        indStr = indStr.replace(/\*/g, '.');
      }
      if (m.entityPerRepeatedSubfield) erps = true;
      if (m.entity) {
        m.entity.forEach(e => {
          if (indStr) e.inds = indStr;
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
  // console.log(refData.mtypes);

  // create tsv map
  if (conf.tsvDir) {
    let tsvFiles = fs.readdirSync(conf.tsvDir);
    tsvFiles.forEach(f => {
      if (f.match(/\.tsv$/)) {
        let prop = f.replace(/\.tsv/, '');
        tsvMap[prop] = {}
        let tpath = conf.tsvDir + '/' + f;
        let dat = fs.readFileSync(tpath, { encoding: 'utf8' });
        dat.split(/\n/).forEach(l => {
          let c = l.split(/\t/);
          let k = c[0];
          let v = c[6];
          if (prop === 'locations') { 
            k = c[1];
          } 
          if (k && v) tsvMap[prop][k] = refData[prop][v];
        });
      }
    });
    // console.log(tsvMap);
  }

  let t;
  let ttl = {
    count: 0,
    instances: 0,
    snapshots: 0,
    srs: 0,
    presuc: 0,
    errors: 0
  }
  if (iconf) {
    ttl.holdings = 0;
    ttl.items = 0;
  }
  if (conf.hasMfhd) {
    ttl.mfhds = 0;
  }

  let start = new Date().valueOf();
  let snap = makeSnap();
  writeOut(outs.snapshot, snap);
  ttl.snapshots++;
  let jobId = snap.jobExecutionId;

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
    for (let k = 0; k < recs.length; k++) {
      let r = recs[k];
      ttl.count++
      let inst = {};
      let marc = {};
      let bibCallNum = { value: '', type: ''};
      try { 
        marc = parseMarc(r)
      } catch(e) {
        console.log(e);
        ttl.errors++;
        writeOut(outs.err, r, true);
        continue;
      }

      if (marc.fields['004']) {
        if (conf.hasMfhd) {
          writeOut(outs.mfhds, marc.fields);
          ttl.mfhds++;
        } else {
          let ctrl = (marc.fields['001']) ? marc.fields['001'][0] : '(unknown)'
          console.log(`WARN ${ctrl} is a MFHD record. Skipping...`);
          ttl.errors++;
        }
        continue;
      }
      
      if (conf.controlNum) {
        let tag = conf.controlNum.substring(0, 3);
        let sub = conf.controlNum.substring(3, 4);
        let cf = (marc.fields[tag]) ? marc.fields[tag][0] : '';
        let cnum = (cf) ? getSubs(cf, sub) : '';
        
        if (cnum) {
          if (conf.controlNum === '907a') {
            cnum = cnum.replace(/^\.(.+)\w$/, '$1'); // strip leading . and check digit from Sierra bib numbers
          }
          let f001 = (marc.fields['001']) ? marc.fields['001'][0] : '';
          if (f001) {
            let f003 = (marc.fields['003']) ? marc.fields['003'][0] : '';
            let oldNum = f001;
            if (f003) {
              marc.deleteField('003', 0);
              oldNum = `(${f003})${f001}`;
            }
            marc.addField('035', { ind1: ' ', ind2: ' ', subfields: [{a: oldNum}] });
          }
          if (f001) {
            marc.deleteField('001', 0);
          }
          marc.addField('001', cnum);
        }
      }
      if (conf.callNumbers) {
        for (let t in conf.callNumbers) {
          if (marc.fields[t]) {
            let cn = getSubs(marc.fields[t][0], 'ab');
            let pre = getSubs(marc.fields[t][0], 'f');
            bibCallNum.value = `${pre}^^${cn}`;
            bibCallNum.type = conf.callNumbers[t];
            break;
          }
        }
      }
      
      if (prefix && marc.fields['001']) {
        marc.updateField('001', prefix + marc.fields['001']);
      }
      let hrid = (marc.fields['001']) ? marc.fields['001'][0] : '';
      if (!hrid) {
        ttl.errors++;
        console.log(`ERROR HRID not found at ${ttl.count}!`);
        if (process.env.DEBUG) console.log(r);
        writeOut(outs.err, r, true);
        continue;
      }
      if (seen[hrid]) {
        ttl.errors++;
        console.log(`ERROR Instance HRID (${hrid}) already found at ${ttl.count}`);
        writeOut(outs.err, r, true);
        continue;
      }
      let f245 = (marc.fields['245']) ? marc.fields['245'][0] : '';
      let title = getSubs(f245, 'a');
      if (!title) {
        ttl.errors++;
        console.log(`ERROR no title found (HRID ${hrid})!`);
        writeOut(outs.err, r, true);
        continue;
      } 

      // add "cam" to leaders with blank btyes 5-4
      if (marc.fields.leader) {
        marc.fields.leader = marc.fields.leader.replace(/^(.....)   /, '$1cam');
        marc.fields.leader = marc.fields.leader.replace(/....$/, '4500');
      }

      seen[hrid] = 1;
      let instId = (hrid) ? uuid(hrid, ns) : '';
      marc.mij = fields2mij(marc.fields);
      let raw = mij2raw(marc.mij);
      ldr = marc.fields.leader || '';
      let itypeCode = ldr.substring(6, 7);
      let blvl = ldr.substring(7,8);
      if (marc.fields['880']) {
        marc.fields['880'].forEach(f => {
          let ntag = getSubs(f, '6');
          ntag = ntag.substring(0, 3);
          let tag = repMap[ntag] || ntag;
          if (!marc.fields[tag]) marc.fields[tag] = [];
          marc.fields[tag].push(f);
        });
        delete marc.fields['880'];
      }

      for (let t in marc.fields) {
        let fields = marc.fields[t];
        if (t.match(/^78[05]/)) {
          let occ = 0;
          fields.forEach(f => {
            occ++;
            let inums = getSubs(f, 'xw', -1);
            let ps = {};
            ps.title = getSubs(f, 'ast');
            ps.identifiers = [];
            let pidKey = instId + ps.title + t + occ;
            ps.id = uuid(pidKey, ns);
            if (t === '785') {
              ps.precedingInstanceId = instId;
            } else {
              ps.succeedingInstanceId = instId;
            }
            inums.forEach(i => {
              let ty; 
              if (i.match(/OCoLC|ocm|ocn/)) {
                ty = 'OCLC';
              } else if (i.match(/^\d{4}-\w{4}$/)) {
                ty = 'ISSN';
              } else if (i.match(/[0-9xX]{10,13}/)) {
                ty = 'ISBN';
              } else if (i.match(/\(DLC\)/)) {
                ty = 'LCCN';
              } else {
                ty = 'Other standard identifier'; 
              }
              let itype = refData.identifierTypes[ty];
              let o = {
                value: i,
                identifierTypeId: itype
              }
              ps.identifiers.push(o);
            });
            writeOut(outs.presuc, ps); 
            ttl.presuc++;
          }); 
        } else {
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
                let ff = makeInst(mr, af, f);
                let obj = {};
                let root = '';
                for (let prop in ff) {
                  let [rt, pr] = prop.split('.');
                  if (propMap[prop] === 'string' || propMap[prop] === 'boolean') {
                    if (!inst[prop]) inst[prop] = ff[prop].data;
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
        inst.id = instId;
        if (inst.subjects) inst.subjects = dedupe(inst.subjects, [ 'value' ]);
        if (inst.identifiers) inst.identifiers = dedupe(inst.identifiers, [ 'value', 'identifierTypeId' ]);
        if (inst.languages) inst.languages = dedupe(inst.languages);
        if (!inst.instanceTypeId) inst.instanceTypeId = refData.instanceTypes.zzz;
        if (inst.electronicAccess) {
          for (let x = 0; x < inst.electronicAccess.length; x++) {
            let e = inst.electronicAccess[x];
            if (!e.uri) {
              inst.electronicAccess[x].uri = 'http://no.uri';
            }
          }
        }
        if (inst.instanceTypeId === refData.instanceTypes.unspecified) {
          let itype = typeMap[itypeCode];
          inst.instanceTypeId = refData.instanceTypes[itype] || refData.instanceTypes.uspecified;
        }
        inst.discoverySuppress = false;
        if (supp) {
          let sf = (marc.fields[supp.tag]) ? marc.fields[supp.tag][0] : '';
          if (sf) {
            let val = getSubs(sf, supp.subfield);
            if (val === supp.value) {
              inst.discoverySuppress = true;
            }
          }
        }
        if (conf.catDate && conf.catDate.tag) {
          let t = conf.catDate.tag;
          let s = conf.catDate.subfield;
          let p = conf.catDate.pattern;
          let f = (marc.fields[t]) ? marc.fields[t][0] : '';
          let v = '';
          if (t > '009') {
            v = getSubs(f, s) || '';
          } else {
            v = f || '';
          }
          let d = '';
          if (t === '008' || p === 'yymmdd') {
            d = v.replace(/^(..)(..)(..).*/, '$1-$2-$3');
            d = (d.match(/^[012]/)) ? '20' + d : '19' + d;
          }
          try {
            let nd = new Date(d).toISOString().substring(0, 10);
            inst.catalogedDate = nd;
          } catch(e) {
            console.log(`WARN ${e} (catalogedDate: "${d}")`);
          }
        }
        writeOut(outs.instances, inst);
        ttl.instances++;
        let srsObj = makeSrs(raw, jobId, inst.id, inst.hrid, inst.discoverySuppress);
        writeOut(outs.srs, srsObj);
        ttl.srs++;
        if (idmap) {
          let ea = (inst.electronicAccess) ? JSON.stringify(inst.electronicAccess) : '';
          let instMap = `${inst.hrid}|${inst.id}|${bibCallNum.value}|${bibCallNum.type}|${blvl}|${ea}`;
          writeOut(outs.idmap, instMap, true, '\n');
        }
        if (iconf) {
          let itag = iconf.tag;
          let ifields = marc.fields[itag];
          let suppress = false;
          if (ifields) {
            let hi = makeHoldingsItems(ifields, instId, inst.hrid, suppress, inst.electronicAccess);
            hi.h.forEach(r => {
              writeOut(outs.holdings, r);
              ttl.holdings++;
            });
            hi.i.forEach(r => {
              writeOut(outs.items, r);
              ttl.items++;
            });
          }
        }
      }

      if (ttl.count % 10000 === 0) {
        let now = new Date().valueOf();
        t = (now - start) / 1000;
        console.log('Records processed', ttl.count, `${t} secs.`);
      } 
    };
  });
  fileStream.on('close', () => {
    let now = new Date().valueOf();
    let t = (now - start) / 1000;
    console.log('--------------------');
    ttl['time (secs)'] = t;
    if (t > 60) ttl['time (mins)'] = t / 60;
    for (let x in ttl) {
      let l = x.substring(0,1).toUpperCase() + x.substring(1);
      l = l.padEnd(12);
      let n = ttl[x].toString().padStart(8);
      console.log(l, ':', n);
    }
  });
} catch (e) {
  console.log(e);
}