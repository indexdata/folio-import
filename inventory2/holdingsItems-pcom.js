/*
  NOTE: This script will require items.csv and notes.csv files for the creation of items.
  If these files are not found in the same directory as the MFHD file, the script will immediately fail.
*/

import fs from 'fs';
import path from 'path';
import { v5 as uuid } from 'uuid';
import readline from 'readline';
import { parse } from 'csv-parse/sync';

let confFile = process.argv[2];
let mfhdFile = process.argv[3];

let refDir;
let ns;
const refData = {};
const tsvMap = {};
const suppMap = {};
const outs = {};
const dbug = process.env.DEBUG;

const ifiles = {
  items: 'items.csv',
  notes: 'notes.csv'
}

const ntypeMap = {
  '1': 'General',
  '2': 'Address',
  '3': 'Barcode',
  '4': 'Phone',
  '5': 'Pop',
  '6': 'Universal Borrowing'
};

const statMap = {
  'Claims Returned': 'Claimed returned',
  'Damaged': 'Available',
  'Discharged': 'Available',
  'Not Charged': 'Available',
  'In Transit Discharged': 'In transit',
  'Missing': 'Missing',
  'Withdrawn': 'Withdrawn'
}

const hsuppMap = {
  "WITHDREW-P": true,
  "WITHDREW-GA": true,
  "WITHDREW-SGA": true,
  "WITHDREW-G": true,
  "WITHDREW-S": true,
}

const typeMap = {
  u: 'Physical',
  v: 'Multi-part monograph',
  x: 'Monograph',
  y: 'Serial'
};

const acqMethMap = {
  "c": "Cooperative or consortial purchase",
  "d": "Deposit",
  "e": "Exchange",
  "f": "Free",
  "g": "Gift",
  "l": "Legal deposit",
  "m": "Membership",
  "n": "Non-library purchase",
  "p": "Purchase",
  "q": "Lease",
  "u": "Unknown",
  "z": "Other method of acquisition"
};

const lendPolMap = {
  "a": "Will lend",
  "b": "Will not lend",
  "c": "Will lend hard copy only",
  "l": "Limited lending policy",
  "u": "Unknown lending policy"
};

const rpoMap = {
  "0": "Unknown",
  "1": "Other general retention policy",
  "2": "Retained except as replaced by updates",
  "3": "Sample issue retained",
  "4": "Retained until replaced by microform",
  "5": "Retained until replaced by cumulation, replacement volume, or revision",
  "6": "Retained for a limited period",
  "7": "Not retained",
  "8": "Permanently retained"
};

const elRelMap = {
  '0':'Resource',
  '1':'Version of resource',
  '2':'Related resource',
  '3':'No information provided',
  '8':'No display constant generated'
};

const files = {
  holdings: 1,
  items: 1,
  bwp: 1,
  rel: 1
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

const writeOut = (outStream, data, notJson, newLineChar) => {
  let nl = newLineChar || '';
  let dataStr = (notJson !== undefined && notJson) ? data + nl: JSON.stringify(data) + '\n';
  outStream.write(dataStr, 'utf8');
};


const makeNote = function (text, type, staffOnly) {
  if (!type) throw new Error('Note type not found');
  const out = {
    note: text,
    holdingsNoteTypeId: type,
    staffOnly: staffOnly
  };
  return out;
}

const makeItemNote = function (text, type, staffOnly) {
  if (!type) throw new Error('Note type not found');
  const out = {
    note: text,
    itemNoteTypeId: type,
    staffOnly: staffOnly
  };
  return out;
}

try {
  if (!mfhdFile) { throw "Usage: node holdingsItems-pcom.js <conf_file> <mfhd_jsonl_file>" }
  let confDir = path.dirname(confFile);
  let confData = fs.readFileSync(confFile, { encoding: 'utf8' });
  let conf = JSON.parse(confData);
  ns = conf.nameSpace;
  refDir = conf.refDir.replace(/^\./, confDir);
  let prefix = conf.hridPrefix || '';
  let hprefix = conf.hridPrefix + 'h';
  let iprefix = conf.hridPrefix + 'i';
  let wdir = path.dirname(mfhdFile);
  let fn = path.basename(mfhdFile, '.jsonl');
  let outBase = wdir + '/' + fn;
  for (let f in files) {
    let p = (f === 'err') ? outBase + '-' + f + '.mrc' : (f === 'idmap') ? outBase + '.map' : outBase + '-' + f + '.jsonl';
    files[f] = p;
    if (fs.existsSync(p)) fs.unlinkSync(p);
    outs[f] = fs.createWriteStream(p)
  }

  for (let f in ifiles) {
    let path = wdir + '/' + ifiles[f];
    if (!fs.existsSync(path)) throw new Error(`Required item file "${ifiles[f]}" not found in ${wdir}!`);
    ifiles[f] = path;
  }
  // throw(ifiles);

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
  // throw(refData.itemNoteTypes);

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
          let k = (prop === 'mtypes') ? c[0] : c[1];
          let v = (prop === 'mtypes') ? c[4] : c[6];
          k = k.trim();
          v = v.trim();
          tsvMap[prop][k] = refData[prop][v];
        });
      }
    });
  }
  // throw(tsvMap);
  
  const instMap = {};
  if (conf.makeInstMap) {
    let mfn = fn.replace(/^(.+)-.+/, wdir + '/$1.map');
    let fileStream = fs.createReadStream(mfn);
    let rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });
    for await (let line of rl) {
      let c = line.split(/\|/);
      let k = c[0].substring(1);
      instMap[k] = { id: c[1], ea: c[5], blvl: c[4], type: c[6] };
    }
  }
  // throw(instMap);

  console.log(`INFO Parsing ${ifiles.notes}...`);
  const notes = {};
  let csv = fs.readFileSync(ifiles.notes, { encoding: 'utf8' });
  let rows = parse(csv, {
    columns: true,
    skip_empty_lines: true,
    bom: true
  });
  csv = '';
  let c = 0;
  rows.forEach(r => {
    let k = r.ITEM_ID;
    if (!notes[k]) notes[k] = [];
    notes[k].push({ n: r.ITEM_NOTE, t: r.ITEM_NOTE_TYPE });
    c++
  });
  rows = [];
  console.log('INTO Rows parsed', c);
  // throw(notes);

  let ttl = {
    count: 0,
    holdings: 0,
    items: 0,
    boundwiths: 0,
    relationships: 0,
    holdingsErr: 0,
    itemErr: 0
  }

  let start = new Date().valueOf();

  const showStats = () => {
    let now = new Date().valueOf();
    let t = (now - start) / 1000;
    console.log('--------------------');
    ttl['time (secs)'] = t;
    if (t > 60) ttl['time (mins)'] = t / 60;
    for (let x in ttl) {
      let l = x.substring(0,1).toUpperCase() + x.substring(1);
      l = l.padEnd(14);
      let n = ttl[x].toString().padStart(8);
      console.log(l, ':', n);
    }
  }

  const bcseen = {};
  const iocc = {};
  const makeItems = () => {
    let items = {}
    let csv = fs.readFileSync(ifiles.items, { encoding: 'utf8' });
    items = parse(csv, {
      columns: true,
      skip_empty_lines: true,
      bom: true
    });
    csv = '';

    let count = 0;
    items.forEach(r => {
      if (dbug) console.log(r);
      count++;
      let mid = r.MFHD_ID;
      let hid = hseen[mid];
      let iid = r.ITEM_ID;
      if (iocc[iid]) {
        iocc[iid]++;
      } else {
        iocc[iid] = 1;
      }
      if (hid) {
        let ioccStr = iocc[iid].toString().padStart(2, '0');
        let ihrid = prefix + 'i' + iid + '.' + ioccStr;
        let i = {
          _version: 1,
          id: uuid(ihrid, ns),
          hrid: ihrid,
          permanentLoanTypeId: refData.loantypes['Standard'],
          holdingsRecordId: hid,
          status: { name: 'Available' },
          discoverySuppress: false,
          notes: [],
          circulationNotes: []
        }
        let st = r.LastOfITEM_STATUS_DESC || r.ITEM_STATUS_DESC; 
        let stat = statMap[st] || '';
        if (stat) i.status.name = stat;
        if (st === 'Damaged') {
          i.itemDamagedStatusId = refData.itemDamageStatuses.Damaged;
        }

        let mt = tsvMap.mtypes[r.ITEM_TYPE_ID] || '';
        i.materialTypeId = mt;

        if (r.SUPPRESS_IN_OPAC === 'Y') i.discoverySuppress === true;
  
        let bc = r.ITEM_BARCODE;
        if (bc && !bcseen[bc]) {
          i.barcode = bc;
          bcseen[bc] = i.id;
        } else if (bc) {
          console.log(`WARN duplicate barcode found ${bc} (${i.hrid})`);
        }

        if (r.ITEM_ENUM) i.volume = r.ITEM_ENUM;
        
        if (r.CHRON) i.chronology = r.CHRON;
        if (r.Year || r.CAPTION) {
          i.yearCaption = [];
          if (r.Year) i.yearCaption.push(r.Year);
          if (r.CAPTION) i.yearCaption.push(r.CAPTION);
        }
        if (r.COPY_NUMBER) i.copyNumber = r.COPY_NUMBER;
        if (r.PIECES) i.numberOfPieces = r.PIECES;

        let nts = notes[iid] || [];
        nts.forEach(n => {
          if (n.t === '5') {
            let ic = 0;
            let ct = ['Check out', 'Check in'];
            ct.forEach(c => {
              ic++;
              let o = {
                id: uuid(`${ic}:${n.n}:${c}`, ns),
                note: n.n,
                noteType: c,
                staffOnly: true
              };
              i.circulationNotes.push(o);
            });
          }
          else {
            let ntype = ntypeMap[n.t];
            let ntypeId = refData.itemNoteTypes[ntype];
            if (ntypeId) {
              let o = makeItemNote(n.n, ntypeId, false);
              i.notes.push(o);
            } else {
              console.log(`WARN item note type not found for ${n.t}`);
            }
          }
        });

        if (dbug) console.log(i);
        if (i.materialTypeId) {
          if (i.permanentLoanTypeId) {
            writeOut(outs.items, i);
            ttl.items++;
          } else {
            console.log(`ERROR item loantype not found for "Can circulate"`);
            ttl.itemErr++;
          }
        } else {
          console.log(`ERROR item material type not found for "${ih.t}"`);
          ttl.itemErr++;
        }
      } else {
        console.log(`ERROR no MFHD found for "${mid}" (line ${count})`);
        ttl.itemErr++;
      }
    });
  }

  const hseen = {};
  const bwseen = {};

  let fileStream = fs.createReadStream(mfhdFile);
  let rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });
  for await (let line of rl) {
    ttl.count++;
    let m = JSON.parse(line);
    let ctrl = (m['001']) ? m['001'][0] : '';
    let bhrid = (m['004']) ? m['004'][0] : '';
    let mh = {};
    let iid = '';
    let addNotes = [];
    if (m['852']) {
      m['852'].forEach(f => {
        f.subfields.forEach(s => {
          let k = Object.keys(s)[0];
          if (k.match(/[zx]/)) {
            if (!mh[k]) mh[k] = [];
            mh[k].push(s[k]);
          } else if (m['852'].length > 1 && k === 'b' && !tsvMap.locations[s[k]]) {
            addNotes.push(s[k]);
          } else {
            mh[k] = s[k]; 
          }
        });
      });
      mh.ind1 = m['852'][0].ind1;
      mh.ind2 = m['852'][0].ind2;
    }
    let loc = mh.b;
    let cn = (mh.i) ? mh.h + ' ' + mh.i : mh.h || '';
    if (cn.match(/No call number/)) cn = '';
    let tcode = (m.leader) ? m.leader.substring(6, 7) : '';
    let tcodeStr = typeMap[tcode] || 'Physical';
    let typeId = refData.holdingsTypes[tcodeStr];
    let inst = instMap[bhrid];
    let hhrid;
    if (ctrl) {
      hhrid = hprefix + ctrl;
    }
    let hid = uuid(hhrid, ns);

    if (inst) {
      let h = {
        _version: 1,
        id: hid,
        hrid: hhrid,
        sourceId: refData.holdingsRecordsSources.FOLIO,
        holdingsTypeId: typeId,
        formerIds: [ ctrl ],
        discoverySuppress: false
      }
      h.instanceId = inst.id;
      h.permanentLocationId = tsvMap.locations[loc] || refData.locations['Unmapped Location'];
      if (cn) {
        h.callNumber = cn;
        h.callNumberTypeId = cnTypeMap[mh.ind1] || cnTypeMap['8'];
      }
      let f008 = m['008'];
      let ameth = (f008) ? f008[0].substring(7, 8) : 'u';
      h.acquisitionMethod = acqMethMap[ameth];
      h.notes = [];
      let ntype = refData.holdingsNoteTypes.Note;
      addNotes.forEach(n => {
        let o = makeNote(n, ntype, true);
        h.notes.push(o);
      });
      if (mh.x) {
        mh.x.forEach(n => {
          let o = makeNote(n, ntype, true);
          h.notes.push(o);
        });
      }
      let f590 = m['590'] || [];
      f590.forEach(f => {
        f.subfields.forEach(s => {
          if (s.a) {
            let o = makeNote(s.a, ntype, true);
            h.notes.push(o);
          }
        });
      });
      let f999 = m['999'] || [];
      f999.forEach(f => {
        let strings = [];
        f.subfields.forEach(s => {
          let k = Object.keys(s)[0]
          strings.push(s[k])
        });
        let n = strings.join('; ');
        let o = makeNote(n, ntype, true);
        h.notes.push(o);
      });

      let lcode = (f008) ? f008[0].substring(20, 21) : 'u';
      let lstr = lendPolMap[lcode];
      let polId = refData.illPolicies[lstr];
      if (polId) h.illPolicyId = polId;

      let rcode = (f008) ? f008[0].substring(12, 13) : '';
      let rstr = rpoMap[rcode];
      if (rstr) h.retentionPolicy = rstr;

      let eaf = m['856'];
      if (eaf) {
        h.electronicAccess = [];
        eaf.forEach(f => {
          let rstr = elRelMap[f.ind2] || 'No information provided';
          let rid = refData.electronicAccessRelationships[rstr];
          let o = {}
          f.subfields.forEach(s => {
            if (s.u) { 
              o.uri = s.u;
            } else if (s.z) {
              o.publicNote = s.z;
            } else if (s['3']) {
              o.materialsSpecification = s['3'];
            }
            o.relationshipId = rid;
          });
          if (o.uri) h.electronicAccess.push(o);
        });
      }

      h.holdingsStatements = [];
      let hst = m['866'] || [];
      hst.forEach(f => {
        let o = {};
        f.subfields.forEach(s => {
          if (s.a) {
            o.statement = s.a;
          } else if (s.x) {
            o.staffNote = s.x;
          } else if (s.z) {
            o.note = s.z;
          }
        });
        h.holdingsStatements.push(o);
      });

      h.holdingsStatementsForSupplements = [];
      hst = m['867'] || [];
      hst.forEach(f => {
        let o = {};
        f.subfields.forEach(s => {
          if (s.a) {
            o.statement = s.a;
          } else if (s.x) {
            o.staffNote = s.x;
          } else if (s.z) {
            o.note = s.z;
          }
        });
        h.holdingsStatementsForSupplements.push(o);
      });

      h.holdingsStatementsForIndexes = [];
      hst = m['868'] || [];
      hst.forEach(f => {
        let o = {};
        f.subfields.forEach(s => {
          if (s.a) {
            o.statement = s.a;
          } else if (s.x) {
            o.staffNote = s.x;
          } else if (s.z) {
            o.note = s.z;
          }
        });
        h.holdingsStatementsForIndexes.push(o);
      });
      
      if (hsuppMap[loc]) {
        h.discoverySuppress = true;
      }

      if (h.permanentLocationId) {
        if (!hseen[ctrl]) {
          ttl.holdings++;
          writeOut(outs.holdings, h);
          hseen[ctrl] = h.id;
          let lnk = m['014'];
          if (lnk) {
            for (let x = 0; x < lnk.length; x++) {
              let sa = lnk[x].subfields[0].a;
              if (!sa.match(/^\d+$/)) {
                lnk.splice(x, 1);
                x--;
              }
            }
            if (iid && lnk[0]) {
              let o = {
                itemId: uuid(iid, ns),
                holdingsRecordId: h.id
              };
              o.id = uuid(o.holdingsRecordId, o.itemId);
              writeOut(outs.bwp, o);
              ttl.boundwiths++
            }
            let occ = 0;
            lnk.forEach(l => {
              occ++;
              l.subfields.forEach(s => {
                if (s.a) {
                  let iid = bibItemMap[s.a];
                  if (iid) {
                    let hstr = JSON.stringify(h);
                    let bwh = JSON.parse(hstr);
                    bwh.instanceId = instMap[s.a];
                    bwh.hrid = `${bwh.hrid}.${occ}`;
                    bwh.id = uuid(bwh.hrid, ns);
                    let o = {
                      itemId: uuid(iid, ns),
                      holdingsRecordId: bwh.id,
                    };                
                    o.id = uuid(o.holdingsRecordId, o.itemId);
                    let ro = {
                      superInstanceId: h.instanceId,
                      subInstanceId: bwh.instanceId,
                      instanceRelationshipTypeId: refData.instanceRelationshipTypes['bound-with']
                    };
                    ro.id = uuid(ro.superInstanceId + ro.subInstanceId, ns);
                    writeOut(outs.bwp, o);
                    writeOut(outs.holdings, bwh);
                    writeOut(outs.rel, ro);
                    ttl.boundwiths++;
                    ttl.relationships++;
                  }
                }
              });
            });
            bwseen[h.id] = 1;
          }
        } else {
          console.log(`ERROR hrid ${hhrid} already used!`);
          ttl.holdingsErr++;
        }
      } else {
        console.log(`ERROR location not found for "${loc}" (${hhrid})`);
        ttl.holdingsErr++;
      }
      if (dbug) console.log(h);
    } else {
      console.log(`ERROR instance "${bhrid}" not found for ${hhrid}`);
      ttl.holdingsErr++;
    }
  }

  makeItems();
  showStats();

} catch (e) {
  console.log(e);
}