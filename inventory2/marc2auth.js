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
const refData = {};
const outs = {};
const seen = {};

const files = {
  authorities: 1,
  srs: 1,
  snapshot: 1,
  err: 1
};

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
    if (!out.match(/\S/)) out = ''; 
    return out;
  },
  set_issuance_mode_id: function () {
    let c = ldr.substring(7,8);
    let cstr = modeMap[c] || 'unspecified';
    let out = refData.issuanceModes[cstr];
    return out;
  },
  set_instance_type_id: function (data, param) {
    data = data.replace(/ .+/, '');
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
    data = data.toLowerCase().trim().replace(/[ ,.]*$/g, '');
    let out = refData.contributorTypes[data];
    return out;
  },
  set_classification_type_id: function (data, param) {
    return refData.classificationTypes[param.name] || 'ERROR';
  },
  set_date_type_id: function (data) {
    let code = data.substring(6, 7);
    if (refData.instanceDateTypes) {
      return refData.instanceDateTypes[code] || refData.instanceDateTypes.n || 'ERROR';
    } else {
      return '';
    }
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
    if (ind1 === '0') {
      return "true"
    } else {
      return "false"
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
    return refData.subjectSources[data] || refData.subjectSources['Source not specified'];
  },
  set_subject_type_id: function (data, param) {
  },
  set_subject_source_id_by_code: function (data, param) {
    return refData.subjectSources[data] || refData.subjectSources['Source not specified'];
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

const applyRules = function (ent, field, allFields, tag) {
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
          if (subcodes && part) {
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

const makeRec = function (map, field, allFields, tag) {
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
      data = applyRules(e, field, allFields, tag);
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
    recordType: 'MARC_AUTHORITY',
    rawRecord: {
      id: id,
      content: raw.rec
    },
    parsedRecord: {
      id: id,
      content: raw.mij
    },
    externalIdsHolder: {
      authorityId: bid,
      authorityHrid: hrid
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

try {
  if (!rawFile) { throw "Usage: node marc2auth.js <conf_file> <raw_marc_file>" }
  let confDir = path.dirname(confFile);
  let confData = fs.readFileSync(confFile, { encoding: 'utf8' });
  let conf = JSON.parse(confData);
  ns = conf.nameSpace;
  refDir = conf.refDir.replace(/^\./, confDir);
  rulesFile = refDir + '/marc-authority.json';
  let wdir = path.dirname(rawFile);
  let fn = path.basename(rawFile, '.mrc');
  let outBase = wdir + '/' + fn;
  for (let f in files) {
    let p = (f === 'err') ? outBase + '-' + f + '.mrc' : (f === 'idmap') ? outBase + '.map' : outBase + '-' + f + '.jsonl';
    files[f] = p;
    if (fs.existsSync(p)) fs.unlinkSync(p);
    outs[f] = fs.createWriteStream(p)
  };
  let rulesStr = fs.readFileSync(rulesFile, { encoding: 'utf8' });
  const allMappingRules = JSON.parse(rulesStr);
  rulesStr = '';
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
          if (!e.target.match(/authorityId/)) ents.push(e);
        });
      } else {
        ents.push(m);
      }
    });
    mappingRules[tag] = {};
    mappingRules[tag].erps = erps;
    mappingRules[tag].entities = ents;
  }
  // throw(mappingRules);

  // get instance schema
  let schemaFile = `${schemaDir}/authorityDto.yaml`;
  let schemaStr = fs.readFileSync(schemaFile, { encoding: 'utf8'});
  let propMap = {};
  let prop;
  let type;
  schemaStr.split(/\n/).forEach(l => {
    if (l.match(/^  \w/)) {
      prop = l.replace(/\W/g, '');
      propMap[prop] = '';
      type = '';
    } else if (l.match(/^    type:/) && !propMap[type]) {
      type = l.replace(/^\s+type: (.+)/, '$1');
      if (prop && type) propMap[prop] = type; 
    } else if (type === 'array' && l.match(/^ {6}(type|\$ref): /)) {
      let arrType = l.replace(/^ {6}type: (.+)/, '$1');
      if (arrType.match(/\$ref/)) arrType = 'object';
      if (prop && arrType) propMap[prop] = `${type}.${arrType}`;
    }
  });
  // throw(propMap);

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
        if (prop === 'authoritySourceFiles') {
          let codes = p.codes;
          codes.forEach(c => {
            refData[prop][c] = p.id;
          });
        } else {
          if (p.code) {
            refData[prop][p.code] = p.id;
          } 
          if (p.name) {
            if (prop === 'contributorTypes') p.name = p.name.toLowerCase();
            refData[prop][p.name] = p.id;
          }
        }
      });
    } catch {}
  });
  // throw(refData.authoritySourceFiles);

  let t;
  let ttl = {
    count: 0,
    authorities: 0,
    snapshots: 0,
    srs: 0,
    errors: 0
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
      let rec = {};
      let marc = {};
      let bibCallNum = { value: '', type: ''};
      try { 
        marc = parseMarc(r);
      } catch(e) {
        console.log(e);
        ttl.errors++;
        writeOut(outs.err, r, true);
        continue;
      }

      let f010 = (marc.fields['010']) ? getSubs(marc.fields['010'][0], 'a') : '';
      let f001 = (marc.fields['001']) ? marc.fields['001'][0] : '';
      let hrid = f010 || f001;

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

      seen[hrid] = 1;
      let recId = (hrid) ? uuid(hrid, ns) : '';
      marc.mij = fields2mij(marc.fields);
      let raw = mij2raw(marc.mij);
      ldr = marc.fields.leader || '';

      for (let t in marc.fields) {
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
              let ff = makeRec(mr, af, f, t);
              let obj = {};
              let root = '';
              for (let prop in ff) {
                let [rt, pr] = prop.split('.');
                if (propMap[prop] === 'string' || propMap[prop] === 'boolean') {
                  if (!rec[prop]) rec[prop] = ff[prop].data;
                } else if (propMap[prop] === 'array.string') {
                  if (!rec[prop]) rec[prop] = [];
                  rec[prop].push(ff[prop].data);
                } else if (propMap[rt] === 'array.object') {
                  if (!rec[rt]) rec[rt] = [];
                  obj[pr] = ff[prop].data;
                  root = rt;
                } else {
                  if (!rec[rt]) rec[rt] = {};
                  if (ff[prop].data) rec[rt][pr] = ff[prop].data;
                } 
              }
            });
          });
        }
      }
      rec.hrid = hrid;
      rec.source = 'MARC';
      if (rec.hrid) {
        rec.id = recId;
        let scode = hrid.replace(/^([^ 0-9]+).+/, '$1');
        rec.sourceFileId = refData.authoritySourceFiles[scode] || refData.authoritySourceFiles.local;
        if (rec.notes) {
          rec.notes.forEach(n => {
            n.staffOnly = n.staffOnly.replace(/ .*/, '');
          });
        }
        writeOut(outs.authorities, rec);
        ttl.authorities++;
        let srsObj = makeSrs(raw, jobId, rec.id, rec.hrid, rec.discoverySuppress);
        writeOut(outs.srs, srsObj);
        ttl.srs++;
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