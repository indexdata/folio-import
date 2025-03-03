import fs from 'fs';
import path from 'path';
import { v5 as uuid } from 'uuid';
import readline from 'readline';
import { parse } from 'csv-parse/sync';

let confFile = process.argv[2];
let mapFile = process.argv[3];

let refDir;
let ns;
let dbug = process.env.DEBUG;
const refData = {};
const tsvMap = {};
const suppMap = {};
const outs = {};

const typeMap = {
  u: 'Physical',
  v: 'Multi-part monograph',
  x: 'Monograph',
  y: 'Serial'
};

const elRelMap = {
  '0':'Resource',
  '1':'Version of resource',
  '2':'Related resource',
  '3':'No information provided',
  '8':'No display constant generated'
};

const ntypes = {
  'Sierra Checkout Total': true,
  'Sierra Renewal Total': true,
  'Sierra Internal Use Count': true,
  'Sierra Copy Use Count': true,
  'Public Note': false,
  'Circ Note': true,
  'Staff Note': true,
  Donor: true,
  Requestor: true,
  'Input Stamp': true,
  'Sierra Reserves Info': true
};

const files = {
  holdings: 1,
  items: 1,
  bwp: 1,
  rel: 1
};

const itemFiles = {
  items: 'items.csv',
  holding: 'holdings.csv',
  note: 'item-notes.csv',
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
  if (!staffOnly) staffOnly = false;
  if (!type) throw new Error('Note type not found');
  const out = {
    note: text,
    holdingsNoteTypeId: type,
    staffOnly: staffOnly
  };
  return out;
}

try {
  if (!mapFile) { throw "Usage: node holdingsItems-stone.js <conf_file> <instance_map_file>" }
  let confDir = path.dirname(confFile);
  let confData = fs.readFileSync(confFile, { encoding: 'utf8' });
  let conf = JSON.parse(confData);
  ns = conf.nameSpace;
  refDir = conf.refDir.replace(/^\./, confDir);
  let prefix = conf.hridPrefix || '';
  let hprefix = prefix + 'h';
  let iprefix = prefix + 'i';
  let wdir = path.dirname(mapFile);
  let fn = path.basename(mapFile, '.map', '.jsonl');
  let outBase = wdir + '/' + fn;
  for (let f in files) {
    let p = (f === 'err') ? outBase + '-' + f + '.mrc' : (f === 'idmap') ? outBase + '.map' : outBase + '-' + f + '.jsonl';
    files[f] = p;
    if (fs.existsSync(p)) fs.unlinkSync(p);
    outs[f] = fs.createWriteStream(p)
  }
  for (let f in itemFiles) {
    let path = wdir + '/' + itemFiles[f];
    if (!fs.existsSync(path)) {
      throw new Error(`ERROR Can't find require file ${path}`);
    }
    itemFiles[f] = path;
  }
  // throw(itemFiles);

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
  // throw(refData);

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
          if (prop === 'statuses') {
            let v = c[5].trim();
            if (!v || v.match(/Checked out|Paged|Aged to lost/)) v = 'Available';
            tsvMap[prop][k] = v;
          } else {
            let v = (prop === 'mtypes') ? c[7] : c[11];
            v = v.trim();
            if (k && v) tsvMap[prop][k] = refData[prop][v];
          }
        });
      }
    });
  }
  // throw(tsvMap);

  const instMap = {};
  if (conf.makeInstMap) {
    let fileStream = fs.createReadStream(mapFile);
    let rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });
    for await (let line of rl) {
      let c = line.split(/\|/);
      let k = c[0].substring(1);
      instMap[k] = { id: c[1], blvl: c[4], type: c[6], ea: c[5] };
    }
  }
  // throw(instMap);

  for (let k in ntypes) {
    let o = {
      staffOnly: ntypes[k],
      type: refData.itemNoteTypes[k]
    }
    ntypes[k] = o;
  }
  // throw(ntypes);

  let ttl = {
    holdings: 0,
    items: 0,
    boundwiths: 0,
    relationships: 0,
    errors: 0,
    itemErrors: 0
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

  const hseen = {};
  const iseen = {};

  /*
    Holdings only section
  */

  let csv = fs.readFileSync(itemFiles.holding, { encoding: 'utf8' });
  let holdings = parse(csv, {
    columns: true,
    skip_empty_lines: true
  });
  csv = '';
  let rc = 0;
  let occ = {};
  for (let x in holdings) {
    rc++;
    let r = holdings[x];
    if (dbug) console.log(r);
    let bid = r.bib_record_num;
    let instId = instMap[bid];
    let hid = r.holdings_record_num;
    if (!hid) {
      if (occ[bid]) {
        occ[bid]++
      } else {
        occ[bid] = 1;
      }
      let occStr = occ[bid].toString().padStart(3, '0');
      hid = `${bid}-${occStr}`;
    }
    let pnt = r.holdings_note;
    let sta = r.holdings_statement;
    let lcode = r.holdings_location_code.trim();
    let locId = tsvMap.locations[lcode];
    let snt = r.holdings_staff_note;
    let cn = r.holdings_call_num;
    let cnt = r.holdings_call_num_type;
    let hrid = hprefix + hid;
    let hkey = `${bid}:${lcode}:${cn}`;

    let h = {
      _version: 1,
      id: uuid(hrid, ns),
      hrid: hrid,
      instanceId: instId.id,
      permanentLocationId: locId,
      sourceId: refData.holdingsRecordsSources.FOLIO,
      notes: []
    };
    if (cn) {
      cnt = (cnt === 'Library of Congress') ? 'Library of Congress classification' : 'Other scheme';
      let cntId = refData.callNumberTypes[cnt];
      if (!cntId) throw new Error(`ERROR callNumberTypeId not found for "${cnt}"`);
      h.callNumber = cn;
      h.callNumberTypeId = cntId;
    }
    if (pnt) {
      let ts = 'Public Note';
      let t = refData.holdingsNoteTypes[ts];
      if (!t) throw new Error(`ERROR holdingsNoteType not found for "${ts}"!`);
      pnt.split(/\|/).forEach(n => {
        let o = makeNote(n, t);
        h.notes.push(o);
      });
    }
    if (snt) {
      let ts = 'Staff Note';
      let t = refData.holdingsNoteTypes[ts];
      if (!t) throw new Error(`ERROR holdingsNoteType not found for "${ts}"!`);
      snt.split(/\|/).forEach(n => {
        let o = makeNote(n, t, true);
        h.notes.push(o);
      });
    }
    if (sta) {
      let o = {
        statement: sta,
      }
      h.holdingsStatements = [ o ];
    }

    if (h.instanceId) {
      if (h.permanentLocationId) {
        if (h.sourceId) {
          writeOut(outs.holdings, h);
          ttl.holdings++;
        } else {
          console.log(`ERROR holdings sourceId not found (${hid})!`);
          ttl.errors++;
        }
      } else {
        console.log(`ERROR holdings locationId not found for "${lcode}" (${hid})!`);
        ttl.errors++;
      }
    } else {
      console.log(`ERROR holdings instanceId not found for "${bid} (${hid})"!`);
      ttl.errors++;
    }
    if (dbug) console.log(h);
    hseen[hkey] = h.id;
  }
  // throw('');

  /*
    This is the item creation section
  */
  
  // map notes
  csv = fs.readFileSync(itemFiles.note, { encoding: 'utf8' });
  let vrecs = parse(csv, {
    columns: true,
    skip_empty_lines: true
  });
  csv = '';
  let noteMap = {};
  console.log('INFO Creating note map...');
  rc = 0;
  for (let x in vrecs) {
    let r = vrecs[x];
    let iid = r.item_record_num;
    delete r.item_record_num;
    noteMap[iid] = r;
    rc++
  }
  console.log(`INFO ${rc} notes mapped.`);
  vrecs = [];
  // throw(noteMap);

  csv = fs.readFileSync(itemFiles.items, { encoding: 'utf8' });
  let items = parse(csv, {
    columns: true,
    skip_empty_lines: true
  });
  csv = '';
  rc = 0;
  let bcseen = {};
  for (let x in items) {
    let r = items[x];
    if (dbug) console.log(r);
    let iid = r.item_record_num;
    let id = uuid(iid, ns);
    let hrid = iprefix + iid;
    let bid = r.bib_record_num;
    let inst = instMap[bid] || {};
    let itype = r.itype_code;
    let lcode = r.location_code;
    let locId = tsvMap.locations[lcode];
    let scode = r.item_status_code;
    let copy = r.copy_num;
    let cn = r.call_num;
    let cnt = r.call_num_type;
    let bc = r.barcode;
    let supp = r.is_suppressed;
    let vol = r.volume;
    let hkey = `${bid}:${lcode}:${cn}`;
    let hid = hseen[hkey];
    if (!hid) {
      if (occ[bid]) {
        occ[bid]++;
      } else {
        occ[bid] = 1;
      }
      let occStr = occ[bid].toString().padStart(3, '0');
      let hrid = hprefix + bid + '-' + occStr;
      let h = {
        _version: 1,
        id: uuid(hrid, ns),
        hrid: hrid,
        instanceId: inst.id,
        permanentLocationId: locId,
        sourceId: refData.holdingsRecordsSources.FOLIO,
      };
      if (cn) {
        cnt = (cnt === 'Library of Congress') ? 'Library of Congress classification' : 'Other scheme';
        let cntId = refData.callNumberTypes[cnt];
        if (!cntId) throw new Error(`ERROR callNumberTypeId not found for "${cnt}"`);
        h.callNumber = cn;
        h.callNumberTypeId = cntId;
      }
      if (h.instanceId) {
        if (h.permanentLocationId) {
          if (h.sourceId) {
            writeOut(outs.holdings, h);
            ttl.holdings++;
            hseen[hkey] = h.id;
          } else {
            console.log(`ERROR holdings sourceId not found (${hid})!`);
            ttl.errors++;
          }
        } else {
          console.log(`ERROR holdings locationId not found for "${lcode}" (${hid})!`);
          ttl.errors++;
        }
      } else {
        console.log(`ERROR holdings instanceId not found for "${bid}" (${hid})!`);
        ttl.errors++;
      }
      if (dbug) console.log(h);
    }
    
    hid = hseen[hkey];
    if (hid) {
      let hrid = iprefix + iid;
      let i = {
        _version: 1,
        id: uuid(hrid, ns),
        hrid: hrid,
        holdingsRecordId: hid,
        formerIds: [ iid ],
        notes: [],
        discoverySuppress: false,
      };
      if (scode === 'n') scode = '';
      let st = tsvMap.statuses[scode] || 'Available';
      i.status = { name: st };
      if (bc && !bcseen[bc]) {
        i.barcode = bc;
        bcseen[bc] = iid;
      }
      if (scode === 'd') {
        i.itemDamagedStatusId = refData.itemDamageStatuses.Damaged;
      }
      // if (supp === 'TRUE') i.discoverySuppress = true;
      if (vol) i.volume = vol;
      if (copy) i.copyNumber = copy;
      i.materialTypeId = tsvMap.mtypes[itype];
      i.permanentLoanTypeId = refData.loantypes['Can circulate'];

      // note stuff here
      let nn = noteMap[iid];
      if (nn) {
        delete nn.id;
        for (let k in nn) {
          let v = nn[k];
          if (v) {
            if (k === 'Circ Note') {
              i.circulationNotes = [];
              let t = ['Check in', 'Check out'];
              t.forEach(y => {
                let o = {
                  note: v,
                  noteType: y,
                  date: new Date().toISOString().replace(/T.+/, ''),
                  id: uuid(iid + y, ns)
                };
                i.circulationNotes.push(o);
              });
            } else {
              let t = ntypes[k].type;
              let so = ntypes[k].staffOnly;
              v.split(/\|/).forEach(x => {
                let o = {
                  note: x,
                  itemNoteTypeId: t,
                  staffOnly: so
                }
                i.notes.push(o);
              });
            }
          }
        }
      }

      if (!iseen[iid]) {
        if (i.materialTypeId) {
          if (i.permanentLoanTypeId) {
            writeOut(outs.items, i);
            iseen[iid] = i.id;
            ttl.items++;
          } else {
            console.log(`ERROR loantype not found for ${iid}`);
            ttl.itemErrors++;
          }
        } else {
          console.log(`ERROR material type "${itype}" not found for ${iid}`);
          ttl.itemErrors++;
        }
      } else {
        console.log(`ERROR item id "${iid}" already seen`);
        ttl.itemErrors++;
      }
      if (dbug) console.log(i);
    }
  }

  showStats();

} catch (e) {
  console.log(e);
}