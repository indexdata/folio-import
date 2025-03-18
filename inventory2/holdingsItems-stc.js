import fs from 'fs';
import path from 'path';
import readline from 'readline';
import parse from 'csv-parse/lib/sync.js';
import uuid from 'uuid/v5.js';

let confFile = process.argv[2];
let bibMap = process.argv[3];
let cusFile = process.argv[4];
let csvFile = process.argv[5];

let refDir;
let ns;
const refData = {};
const tsvMap = {};
const outs = {};

const typeMap = {
  u: 'Physical',
  v: 'Multi-part monograph',
  x: 'Monograph',
  y: 'Serial'
}

const elRelMap = {
  '0':'Resource',
  '1':'Version of resource',
  '2':'Related resource',
  '3':'No information provided',
  '8':'No display constant generated'
}

const files = {
  holdings: 1,
  items: 1
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
};

const ntypeMap = {
  STAFF: 'Staff Note',
  PONUMBER: 'PO Number',
  PUBLIC: 'Public Note',
  I_NUMBER: 'Invoice',
  PRICE: 'Price',
};

const statMap = {
  HOLDS: 'Awaiting pickup',
  'LOST, LOST-CLAIM': 'Declared lost',
  INPROCESS: 'In process (non-requestable)',
  INTRANSIT: 'In transit',
  LONGOVRDUE: 'Long missing',
  'LOST-PAID': 'Lost and paid',
  MISSING: 'Missing',
  'AUCTION, DISCARD': 'Withdrawn'
}

const inotes = [];

const writeOut = (outStream, data, notJson, newLineChar) => {
  let nl = newLineChar || '';
  let dataStr = (notJson !== undefined && notJson) ? data + nl: JSON.stringify(data) + '\n';
  outStream.write(dataStr, 'utf8');
};

const makeNote = function (text, type, staffOnly) {
  if (!type) throw new Error('Note type not found');
  const out = {
    note: text,
    itemNoteTypeId: type,
    staffOnly: staffOnly
  };
  return out;
}

try {
  if (!csvFile) { throw "Usage: node holdingsItems-stc.js <conf_file> <bib_map> <custom_file> <pipe_delimited_item_file>" }
  let confDir = path.dirname(confFile);
  let confData = fs.readFileSync(confFile, { encoding: 'utf8' });
  let conf = JSON.parse(confData);
  ns = conf.nameSpace;
  refDir = conf.refDir.replace(/^\./, confDir);
  let prefix = conf.hridPrefix || '';
  let hprefix = conf.hridPrefix + 'u';
  let iprefix = conf.hridPrefix + 'ui';
  let wdir = path.dirname(csvFile);
  let fn = path.basename(csvFile, '.txt', '.csv');
  let outBase = wdir + '/' + fn;
  for (let f in files) {
    let p = (f === 'err') ? outBase + '-' + f + '.mrc' : (f === 'idmap') ? outBase + '.map' : outBase + '-' + f + '.jsonl';
    files[f] = p;
    if (fs.existsSync(p)) fs.unlinkSync(p);
    outs[f] = fs.createWriteStream(p)
  }
  // throw(files);

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
          let k = c[0]; 
          let v = c[1];
          if (prop === 'locations') {
            let loc = c[1].split(/, */);
            v = c[3];
            loc.forEach(l => {
            k = c[0] + ':' + l;
              tsvMap[prop][k] = refData.locations[v];
            });
          } else {
            tsvMap[prop][k] = refData[prop][v];
            if (!tsvMap.loantypes) tsvMap.loantypes = {};
            tsvMap.loantypes[k] = refData.loantypes[c[2]];
          }
        });
      }
    });
  }
  // throw(tsvMap);

  const instMap = {};
  if (conf.makeInstMap) {
    let fileStream = fs.createReadStream(bibMap);
    let rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });
    for await (let line of rl) {
      let c = line.split(/\|/);
      let k = c[0].replace(/^[a-z0]+/, '');
      c[2] = c[2].replace(/^\^\^/, '');
      let ea = (c[5]) ? JSON.parse(c[5]) : [];
      let o = { id: c[1], cn: c[2], cnt: c[3], blvl: c[4], type: c[6], ea: ea }; 
      instMap[k] = o;
    }
  }
  // throw(instMap);

  const custMap = {};
  let fileStream = fs.createReadStream(cusFile);
  let rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });
  for await (let line of rl) {
    let c = line.split(/\|/);
    let k = c[0].trim();
    let v;
    try {
      c[1] = c[1].replace(/&#124;./g, '');
      v = JSON.parse(c[1]);
    } catch (e) {
      v = c[1];
    }
    custMap[k] = v;
  }
  // throw(JSON.stringify(custMap, null, 2));

  let start = new Date().valueOf();

  const showStats = () => {
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
  }

  let csv = fs.readFileSync(csvFile, { encoding: 'utf8' });
  let inRecs = parse(csv, {
    columns: true,
    skip_empty_lines: true,
    bom: true,
    delimiter: '|',
    relax_column_count: true,
    trim: true,
    quote: null
  });
  csv = '';

  let ttl = {
    count: 0,
    holdings: 0,
    items: 0,
    errors: 0,
    item_errors: 0
  } 
  
  const occ = {};
  const hseen = {};
  const bcseen = {};
  for (let r of inRecs) {
    ttl.count++;
    if (process.env.DEBUG) console.log(r);
    let bid = r.CATKEY;
    let imap = instMap[bid];
    if (!imap) {
      console.log(`ERROR instance not found for BIB_ID ${bid}`);
      ttl.errors++;
      continue;
    }
    let iid = r.ITEM_ID;
    let loc = r.LIBRARY + ':' + r.HOME_LOC;
    let cn = r.BASE_CALL;
    let cnt = (r.CALL_TYPE === 'LC') ? refData.callNumberTypes['Library of Congress classification'] : refData.callNumberTypes['Other scheme'];
    let hsupp = (r.CALL_SHADOW === '1') ? true : false;
    let isupp = (r.ITEM_SHADOW === '1') ? true : false;

    let hkey = bid+loc+cn;
    if (!occ[bid]) {
      occ[bid] = 1;
    }
    if (!hseen[hkey]) {
      let typeId = (imap.blvl === 's') ? refData.holdingsTypes.Serial : refData.holdingsTypes.Monograph;
      let occStr = occ[bid].toString().padStart(3, '0');
      let hhrid = hprefix + bid + '-' + occStr;
      let hid = uuid(hhrid, ns);
      let locId = tsvMap.locations[loc];
      if (!locId) {
        console.log(`ERROR location ID not found for "${loc}" (${iid})`);
        ttl.errors++;
        continue;
      }
      let h = {
        id: hid,
        hrid: hhrid,
        instanceId: imap.id,
        permanentLocationId: locId,
        sourceId: refData.holdingsRecordsSources.FOLIO,
        holdingsTypeId: typeId,
        discoverySuppress: hsupp
      }
      if (cn) {
        h.callNumber = cn;
        h. callNumberTypeId = cnt;
      }
      if (process.env.DEBUG) console.log(h);
      writeOut(outs.holdings, h);
      hseen[hkey] = hid;
      occ[bid]++;
      ttl.holdings++;
    }

    // items start here

    if (!iid) {
      console.log(`ITEM ERROR [${ttl.count}] ITEM_ID not found!`);
      continue;
    }
    let bar = r.ITEM_ID;
    let enu = r.VOLUME;
    let cop = r.COPY;
    let pie = r.PIECES;
    let anote = r.CREATED;
    let idate = r.INVENTORY;
    let status = r.CURR_LOC;
    let itype = r.ITEM_TYPE;
    let price = r.PRICE;
    price = price.replace(/(..)$/, '.$1');
    if (price === '0') price = '0.00';
    let scode = r.ITEM_CAT2;
    let cust = custMap[iid];
    let ihrid = iprefix + iid;
    let i = {
      id: uuid(ihrid, ns),
      hrid: ihrid,
      holdingsRecordId: hseen[hkey],
      notes: [],
      discoverySuppress: isupp,
    }
    if (bar) {
      if (!bcseen[bar]) {
        i.barcode = bar;
        bcseen[bar] = 1;
      } else {
        console.log(`WARN barcode ${bar} already seen.`)
      }
    }
    if (enu) {
      i.enumeration = enu;
    }
    if (anote) {
      i.administrativeNotes = [ 'Symphony Date Created: ' + anote ];
    }
    if (idate) {
      let t = refData.itemNoteTypes['Inventory Date']
      let n = makeNote(idate, t, true);
      i.notes.push(n);
    }
    if (!cust) cust = {};
    if (price) cust.PRICE = [ { D: price } ];
    if (cust) {
      for (let k in cust) {
        if (k === 'CIRCNOTE') {
          i.circulationNotes = [];
          let nocc = 0;
          cust['CIRCNOTE'].forEach(n => {
            if (n.D) {
              let d = new Date().toISOString();
              d = d.substring(0, 10);
              [ 'Check in', 'Check out'].forEach(t => {
                let o = {
                  id: uuid(n.D + ihrid + nocc, ns),
                  note: n.D,
                  noteType: t,
                  date: d,
                  staffOnly: true
                }
                i.circulationNotes.push(o);
                nocc++;
              });
            }
          });
        } else {
          let tstr = ntypeMap[k];
          let tid = refData.itemNoteTypes[tstr];
          cust[k].forEach(n => {
            let note = n.D;
            if (note) {
              let so = (k.match(/STAFF|PONUMBER|I_NUMBER|PRICE|INVENTORY/)) ? true : false;
              let o = makeNote(note, tid, so);
              i.notes.push(o);
            }
          });
        }
        
      }
    }
    let st = statMap[status] || 'Available';
    i.status = { name: st };
    i.materialTypeId = tsvMap.mtypes[itype];
    i.permanentLoanTypeId = tsvMap.loantypes[itype];

    if (scode) {
      let scodeId = refData.statisticalCodes[scode];
      if (scodeId) i.statisticalCodeIds = [ scodeId ];
      else {
        console.log(`WARN statistical code not found for ${scode}`);
      }
    }

    if (cop) i.copyNumber = cop;
    if (pie) i.numberOfPieces = pie;
    if (process.env.DEBUG) console.log(i);
    if (i.materialTypeId) {
      if (i.permanentLoanTypeId) {
        writeOut(outs.items, i);
        ttl.items++;
      } else {
        console.log(`ERROR ITEM loan type not found for "${itype}" (${iid})`);
        ttl.item_errors++;
      }
    } else {
      console.log(`ERROR ITEM material type not found for "${itype}" (${iid})`);
      ttl.item_errors++
    }
  }

  /*
    This is the item creation section
  */

  showStats();

} catch (e) {
  console.log(e);
}
