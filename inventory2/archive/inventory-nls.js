import { parseMarc, getSubs, mij2raw, fields2mij, getSubsHash } from '../js-marc/js-marc.mjs';
import fs from 'fs';
import path from 'path';
import { v5 as uuid } from 'uuid';
import readline from 'readline';
import { parse } from 'csv-parse';

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
const instMap = {};
const outs = {};
const linkMap = {};
const bcseen = {};
const hseen = {};
const occ = {};
const seen = {};

const tagMap = {
  FMT: '996',
  UID: '',
  CAT: '998',
  SYS: '',
  SGN: '',
  PUB: '',
  AAR: '',
  ANM: '',
  ATR: '',
  BST: '',
  DAT: '',
  ENH: '',
  LKR: '',
  LPL: '',
  MTI: '',
  NMN: '',
  STA: '',
  TIT: '245',
  YR1: '',
  YR2: ''
};

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
 c: 'single unit',
 d: 'single unit',
 m: 'single unit',
 s: 'serial',
 b: 'serial',
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
  err: 1,
  holdings: 1,
  items: 1,
  bwp: 1,
  rel: 1,
};

const itemFiles = {
  items: 'items.tsv',
  links: 'links.tsv'
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

const tiSubs = 'anpbcfghks';

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
    let c = ldr.substring(7,8);
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
  set_subject_source_id_by_code: function (data, param) {
    return refData.subjectSources[data] || refData.subjectSources['Source not specified'];
  },
  set_subject_source_id: function (data, param) {
  },
  set_subject_type_id: function (data, param) {
    let tstr = param.name;
    let tid = refData.subjectTypes[tstr] || refData.subjectTypes['Type of entity unspecified'];
    return tid;
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

const makeInst = function (map, field, allFields, tag) {
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

let today = new Date().toISOString().replace(/T.+/, 'T12:00:00.000+0000');
let start = new Date().valueOf();

const ttl = {
  count: 0,
  instances: 0,
  snapshots: 0,
  srs: 0,
  presuc: 0,
  errors: 0,
  holdings: 0,
  items: 0,
  itemErrors: 0
}

const makeHoldingsItems = async function () {

  const typeMap = {
    u: 'Physical',
    v: 'Multi-part monograph',
    m: 'Monograph',
    s: 'Serial'
  };

  const elRelMap = {
    '0':'Resource',
    '1':'Version of resource',
    '2':'Related resource',
    '3':'No information provided',
    '8':'No display constant generated'
  };

  const cnoteTypes = [ 'Check in' ];

  const makeNote = function (text, type, staffOnly) {
    if (!staffOnly) staffOnly = false;
    if (!type) throw new Error('Note type not found');
    const out = {
      note: text,
      itemNoteTypeId: type,
      staffOnly: staffOnly
    };
    return out;
  }
  
  const makeHoldingsNote = function (text, type, staffOnly) {
    if (!staffOnly) staffOnly = false;
    if (!type) throw new Error('Note type not found');
    const out = {
      note: text,
      holdingsNoteTypeId: type,
      staffOnly: staffOnly
    };
    return out;
  }

  const hi = (r) => {
    // console.log(r);
    let aid = r.Z30_REC_KEY.substring(0, 9);
    let iid = r.Z30_REC_KEY;
    let bid = linkMap[aid] || '';
    let inst = instMap[bid];
    let bc = r.Z30_BARCODE;
    let mt = r.Z30_MATERIAL;
    let st = r.Z30_ITEM_STATUS;
    let cn = r.Z30_CALL_NO;
    let ct = r.Z30_CALL_NO_TYPE;
    let col = r.Z30_COLLECTION || '';
    let ips = r.Z30_ITEM_PROCESS_STATUS;
    let loc = r.Z30_SUB_LIBRARY;
    let locKey = loc + ':' + st;
    let locId;
    if (col === '400') { 
      locId = refData.locations['loc-hs'];
    } else if (cn.match(/Astrid Lindgrensamlingen/i)) {
      locId = refData.locations['loc-al'];
    } else if (loc === 'RRLEX' && st === '02' && ips === 'SN') {
      locId = refData.locations['loc-hem'];
    } else {
      locId = tsvMap.locations[locKey] || refData.locations.datamigration;
    }
    
    if (inst) {
      let hkey = bid + ':' + loc;
      if ((loc === 'ENHET' && st === '73') || (loc === 'RRLEX' && (st === '31' || st === '32')) || cn === 'AVM') {
        // instance suppression formula ^^^^ 
      }
      if (!hseen[hkey]) {
        occ[bid] = (!occ[bid]) ? 1 : occ[bid] + 1;
        let occStr = occ[bid].toString().padStart(3, '0');
        let hhrid = bid + '-' + occStr;
        let hid = uuid(hhrid, ns);
        let htypeId = (inst.blvl === 's') ? refData.holdingsTypes['Serial'] : refData.holdingsTypes['Monograph'];
        let h = {
          _version: 1,
          id: hid,
          hrid: hhrid,
          instanceId: inst.id,
          sourceId: refData.holdingsRecordsSources.FOLIO,
          permanentLocationId: locId,
          holdingsTypeId: htypeId,
          notes: []
        }
        if (cn) { 
          h.callNumber = cn;
          h.callNumberTypeId = refData.callNumberTypes['Other scheme'];
        }

        let anf = inst.af['852'] || [];
        if (anf[0]) h.administrativeNotes = [];
        anf.forEach(f => {
          h.administrativeNotes.push(f.string);
        });

        let hsf = inst.af['866'] || [];
        if (hsf[0]) h.holdingsStatements = [];
        hsf.forEach(f => {
          let o = {};
          if (f.a) o.statement = f.a;
          if (f.z) o.note = f.z;
          if (f.x) o.staffNote = f.x;
          if (o.statement || o.note) h.holdingsStatements.push(o);
        });

        let pnf = inst.af['561'] || [];
        pnf.forEach(f => {
          let t = refData.holdingsNoteTypes.Provenance;
          let o = makeHoldingsNote(f, t);
          if (f && t) h.notes.push(o)
        });

        let snf = inst.af['520'] || [];
        snf.forEach(f => {
          let t = refData.holdingsNoteTypes.Note;
          let o = makeHoldingsNote(f, t);
          if (f && t) h.notes.push(o)
        });

        if (inst.ea) {
          h.electronicAccess = inst.ea;
        }

        if (h.permanentLocationId) {
          writeOut(outs.holdings, h);
          ttl.holdings++;
          hseen[hkey] = { id: hid, cn: cn };
        } else {
          console.log(`ERROR permanentLocationId not found for ${loc}!`);
          ttl.errors++;
        }
      }
      let hr = hseen[hkey];
      if (hr) {
        let nt = { p: [], s: []};
        let i = {
          _version: 1,
          id: uuid(iid, ns),
          hrid: iid,
          holdingsRecordId: hr.id,
          discoverySuppress: false,
          notes: [],
          status: { name: 'Available' }
        };
        let desc = r.Z30_DESCRIPTION || '';
        let istat = r.Z30_ITEM_STATISTIC || '';
        let bc = r.Z30_BARCODE;
        let en = r.Z30_ENUMERATION_A;
        if (r.Z30_NOTE_OPAC) nt.p.push(r.Z30_NOTE_OPAC);
        if (r.Z30_NOTE_INTERNAL) nt.s.push(r.Z30_NOTE_INTERNAL);
        let cnote = r.Z30_NOTE_CIRCULATION
        let mt = r.Z30_MATERIAL;
        let chdate = r.Z30_DATE_LAST_RETURN;
        let chhour = r.Z30_HOUR_LAST_RETURN;

        if (st === '05') i.discoverySuppress = true;
        // if (desc) i.displaySummary = desc;
        if (istat === 'TG') i.accessionNumber = 'RFID';
        if (bc && !bcseen[bc]) {
          i.barcode = bc;
          bcseen[bc] = 1;
        } else if (bc) {
          console.log(`WARN ITEM barcode "${bc}" already used!`);
        }
        if (cn !== hr.cn) {
          i.itemLevelCallNumber = cn;
          i.itemLevelCallNumberTypeId = refData.callNumberTypes['Other scheme'];
        }
        if (en) {
          i.enumeration = en;
        }

        if (ips.match(/^(FK|CL|NA)$/)) {
          i.status.name = 'Missing';
          if (ips === 'CL') {
            nt.s.push('Reklamerad');
          } else if (ips === 'NA') {
            nt.s.push('Ej anländ');
          }
        } else if (ips === 'UA') {
          i.status.name = 'In process';
        } else if (st === '71' && loc.match(/^(RRLEX|RRSPE)$/)) {
          i.status.name = 'Long missing';
        } else if (st === '72' && loc === 'RRLEX') {
          i.status.name = 'Intellectual item';
        }

        if (loc === 'RRSPE' && st === '21' && ips === 'DS') {
          nt.p.push('Läses digitalt på läsplatta');
        } else if (loc === 'RRSPE' && st === '28' && ips === 'RP') {
          nt.p.push('Spärrad av bevarandeskäl');
        } else if (loc === 'RESTR') {
          if ((st === '03' || st === '22') && ips === 'RP') {
            nt.p.push('Spärrad av bevarandeskäl');
          } else if (st === '22') {
            nt.p.push('Annat ex finns');
          }
        }

        i.materialTypeId = tsvMap.mtypes[mt] || refData.mtypes.Unmapped;

        for (let k in nt) {
          nt[k].forEach(n => {
            let t = refData.itemNoteTypes['Public note'];
            let so = false;
            if (k === 's') {
              t = refData.itemNoteTypes['Internal note'];
              so = true;
            }
            if (t) {
              let o = makeNote(n, t, so);
              i.notes.push(o);
            } else {
              console.log(`WARN ITEM note type for "${k}" not found (${iid})`);
            }
          });
        }

        if (cnote) {
          i.circulationNotes = [];
          cnoteTypes.forEach(t => {
            let o = {
              id: uuid(i.id + t, ns),
              note: cnote,
              noteType: t,
              staffOnly: true,
              date: today
            }
            i.circulationNotes.push(o);
          });
        }

        let pl = '';
        let tl = '';
        if (loc === 'RRLEX') {
          if (st === '01') {
            pl = 'Läsesalslån';
            switch(ips) {
              case 'DB': tl = 'Digital beställning'; break;
              case 'LA': tl = 'Lagas före lån'; break;
              case 'LL': tl = 'L-samling - kollas före lån'; break;
              case 'UL': tl = 'Under leverans (ABON)'; 
            }
          } else if (st === '02') {
            pl = 'Hemlån';
            switch(ips) {
              case 'LA': tl = 'Lagas före lån'; break;
              case 'UL': tl = 'Under leverans (ABON)'; 
            }
          } else if (st === '05') {
            pl = 'Framtages ej/spärrat'; 
            i.discoverySuppress = true;
          } else if (st === '06') {
            pl = 'Läsesalslån';
            if (ips === 'DB') tl = 'Digital beställning';
          } else if (st === '71') {
            pl = 'Läsesalslån';
            switch(ips) {
              case 'DB': tl = 'Digital beställning'; break;
              case 'SN': pl = 'Hemlån';
            }
          } else if (st === '72') {
            pl = 'Läsesalslån';
          } else if (st === '32') {
            pl = 'Hemlån';
          } else if (st === '31') {
            pl = 'Läsesalslån';
          }
        } else if (loc === 'RRSPE') {
          if (st === '21') {
            pl = 'Specialläsesalslån';
            switch(ips) {
              case 'DB': tl = 'Digital beställning'; break;
              case 'LA': tl = 'Lagas före lån'; break;
              case 'LL': tl = 'L-samling - kollas före lån';
            }
          } else if (st === '27') {
            pl = 'Manuell beställning';
          } else if (st === '71') {
            pl = 'Specialläsesalslån';
          } else if (st === '26') {
            pl = 'Specialläsesalslån';
            switch(ips) {
              case 'DB': tl = 'Digital beställning'; break;
              case 'LA': tl = 'Lagas före lån'; break;
              case 'LL': tl = 'L-samling - kollas före lån';
            }
          } else if (st === '23') {
            pl = 'Specialläsesalslån';
            switch(ips) {
              case 'LA': tl = 'Lagas före lån'; break;
              case 'LL': tl = 'L-samling - kollas före lån';
            }
          } else if (st === '28') {
            pl = 'Specialläsesalslån';
            switch(ips) {
              case 'DB': tl = 'Digital beställning'; break;
              case 'LA': tl = 'Lagas före lån';
            }
          }
        } else if (loc.match(/^(MFL|REF|TLKB)$/) && st === '04') {
          pl = 'Referens';
        } else if (loc === 'PRUMS') {
          switch(st) {
            case '01': pl = 'Läsesalslån'; break;
            case '21': pl = 'Specialläsesalslån'; break;
            case '05': pl = 'Framtages ej/spärrat'; i.discoverySuppress = true;
          }
        } else if (loc === 'ENHET' && st === '73') {
          pl = 'Bokskåp';
          i.discoverySuppress = true;
        } else if (loc === 'RESTR' && (st === '03' || st === '22')) {
          pl = 'Framtages ej/spärrat';
        }

        i.permanentLoanTypeId = refData.loantypes[pl];
        if (tl) { 
          i.temporaryLoanTypeId = refData.loantypes[tl];
          if (!i.temporaryLoanTypeId) console.log(`WARN ITEM temporaryLoanType not found for "${loc}:${st}:${ips} (${tl})"`)
        }

        let lcCol = col.toLowerCase();
        let statCodeId = refData.statisticalCodes[lcCol];
        if (statCodeId) {
          i.statisticalCodeIds = [ statCodeId ];
        } else if (col) {
          console.log(`WARN ITEM no statisticalCode found for "${col}"`);
        }

        if (chdate.match(/^[12]/)) {
          chdate = chdate.replace(/(....)(..)(..)/, '$1-$2-$3');
          chhour = chhour.replace(/(..)(..)/, 'T$1:$2:00.000+0000');
          let fd = chdate + chhour;
          i.lastCheckIn = { dateTime: fd };
        }

        if (i.permanentLoanTypeId) {
          if (i.materialTypeId) {
            writeOut(outs.items, i);
            ttl.items++;
          } else {
            console.log(`ERROR ITEM materialType not found for "${mt}"!`);
          }
        } else {
          console.log(`ERROR ITEM permanantLoanType not found for "${loc}:${st}:${ips} (${pl})"!`);
          ttl.itemErrors++;
        }
      }
    } else {
      console.log(`ERROR instance not found for ${r.Z30_REC_KEY}!`);
    }
  }

  const fileStream = fs.createReadStream(itemFiles.items);
  const parser = parse({
    delimiter: '\t',
    columns: true,
    relax_column_count: true,
    trim: true,
    quote: false
  });
  fileStream.pipe(parser);
  parser.on('data', (rec) => {
    hi(rec);
  });
  parser.on('end', () => {
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
  })
}

try {
  if (!rawFile) { throw "Usage: node inventory-nls.js <conf_file> <raw_marc_file>" }
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
          if (prop === 'locations' || prop === 'statisticalCodes') {
            p.code = p.code.toLowerCase().trim();
          }
          refData[prop][p.code] = p.id;
        } 
        if (p.name) {
          refData[prop][p.name] = p.id;
        }
      });
    } catch {}
  });
  // throw(refData.locations);

  // create tsv map
  let tsvDir = conf.tsvDir || conf.refDir;
  if (tsvDir) {
    let tsvFiles = fs.readdirSync(tsvDir);
    tsvFiles.forEach(f => {
      if (f.match(/\.tsv$/)) {
        let prop = f.replace(/\.tsv/, '');
        tsvMap[prop] = {}
        let tpath = tsvDir + '/' + f;
        let dat = fs.readFileSync(tpath, { encoding: 'utf8' });
        dat.split(/\n/).forEach(l => {
          let c = l.split(/\t/);
          let k = c[0].trim();
          let v = '';
          if (prop === 'locations') {
            k += `:${c[1]}:${c[2]}:${c[3]}:${c[4]}`;
            k = k.replace(/:+$/, '');
            v = c[7].toLowerCase().trim();
          } else {
            v = c[1].trim();
          }
          if (k && v) tsvMap[prop][k] = refData[prop][v];
        });
      }
    });
  }
  // throw(tsvMap);

  for (let f in itemFiles) {
    let path = wdir + '/' + itemFiles[f];
    if (!fs.existsSync(path)) {
      throw new Error(`ERROR Can't find require file ${path}`);
    }
    itemFiles[f] = path;
  }

  // map link files;
  console.log(`Reading linker data from ${itemFiles.links}`);
  let fileStream = fs.createReadStream(itemFiles.links);
  let rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });
  let lc = 0;
  let mc = 0;
  for await (let line of rl) {
    lc++;
    let c = line.split(/\t/);
    let k = c[0].substring(5, 14);
    let seq = c[0].substring(14);
    let t = c[2];
    let bid = c[3];
    let e = c[8];
    if (t === 'KBS01') {
      linkMap[k] = bid;
      mc++;
    }
    if (lc % 1000000 === 0) {
      console.log('Linker lines read:', lc, `(${mc})`);
    }
  }
  console.log('Links mapped:', mc);
  // throw(linkMap);

  let t;
  
  if (iconf) {
    ttl.holdings = 0;
    ttl.items = 0;
  }
  if (conf.hasMfhd) {
    ttl.mfhds = 0;
  }

  let snap = makeSnap();
  writeOut(outs.snapshot, snap);
  ttl.snapshots++;
  let jobId = snap.jobExecutionId;

  fileStream = fs.createReadStream(rawFile, { encoding: 'utf8' });
  
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

      if (marc.fields['004'] && conf.hasMfhd) {
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
        let cnum = (typeof(cf) === 'string') ? cf.trim() : getSubs(cf, sub);
        
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
      let title = getSubs(f245, tiSubs);
      if (!title) {
        if (conf.noTitle) {
          marc.fields['245'] = [ { ind1: '1', ind2: '0', subfields: [ { a: conf.noTitle } ] } ];
          console.log(`WARN no title found for ${hrid}, setting 245$a to "${conf.noTitle}"`);
        } else {
          ttl.errors++;
          console.log(`ERROR no title found (HRID ${hrid})!`);
          writeOut(outs.err, r, true);
          continue;
        }
      } 

      // add "cam" to leaders with blank btyes 5-4
      if (marc.fields.leader) {
        marc.fields.leader = marc.fields.leader.replace(/^(.....)   /, '$1cam');
        marc.fields.leader = marc.fields.leader.replace(/....$/, '4500');
      }

      let librisNumField = marc.fields.UID;
      let librisNum = '';
      if (librisNumField) {
        librisNum = librisNumField[0].trim();
      }

      for (let tag in tagMap) {
        if (marc.fields[tag]) {
          let newTag = tagMap[tag];
          if (marc.fields[newTag]) {
            marc.fields[tag].forEach(f => {
              marc.fields[newTag].push(f);
            });
          } else if (newTag) {
            marc.fields[newTag] = marc.fields[tag];
          }
          delete marc.fields[tag];
        }
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

      let addFields = {};
      for (let t in marc.fields) {
        let fields = marc.fields[t];
        if (t.match(/852|866|520|561/)) {
          fields.forEach(f => {
            let d;
            let str;
            if (t === '852') {
              str = getSubs(f, 'chijlmz');
              d = getSubsHash(f, true);
            } else if (t === '866') {
              d = getSubsHash(f, true);
            } else {
              d = getSubs(f, 'a');
            }
            if (d) {
              if (!addFields[t]) addFields[t] = [];
              if (str) d.string = str;
              addFields[t].push(d);
            }
          });
        }
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
                let ff = makeInst(mr, af, f, t);
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
        if (0) {
          if (!inst.identifiers) inst.identifiers = [];
          inst.identifiers.push({ value: librisNum, identifierTypeId: refData.identifierTypes['Libris number'] })
        }
        if (inst.subjects) inst.subjects = dedupe(inst.subjects, [ 'value' ]);
        if (inst.identifiers) inst.identifiers = dedupe(inst.identifiers, [ 'value', 'identifierTypeId' ]);
        if (inst.languages) inst.languages = dedupe(inst.languages);
        if (!inst.instanceTypeId) inst.instanceTypeId = '30fffe0e-e985-4144-b2e2-1e8179bdb41f';
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
          if (itype) inst.instanceTypeId = refData.instanceTypes[itype] || refData.instanceTypes.unspecified;
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
            if (process.env.DEBUG) console.log(`WARN ${e} (catalogedDate: "${d}")`);
          }
        }
        if (inst.notes) {
          inst.notes.forEach(n => {
            n.staffOnly = n.staffOnly.replace(/ .*/, '');
          });
        }
        writeOut(outs.instances, inst);
        ttl.instances++;
        let srsObj = makeSrs(raw, jobId, inst.id, inst.hrid, inst.discoverySuppress);
        writeOut(outs.srs, srsObj);
        ttl.srs++;
        instMap[inst.hrid] = { id: inst.id, blvl: blvl, type: itypeCode, ea: inst.electronicAccess, af: addFields };
      }
      if (ttl.count % 10000 === 0) {
        let now = new Date().valueOf();
        t = (now - start) / 1000;
        console.log('Records processed', ttl.count, `${t} secs.`);
      } 
    };
  });
  fileStream.on('close', async () => {
    makeHoldingsItems();
    
  });
} catch (e) {
  console.log(e);
}