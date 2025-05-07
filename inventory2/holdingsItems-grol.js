import fs from 'fs';
import path from 'path';
import { v5 as uuid } from 'uuid';
import readline from 'readline';
import { parse } from 'csv-parse/sync';

let confFile = process.argv[2];
let bibMap = process.argv[3];
let csvFile = process.argv[4];

let refDir;
let ns;
const refData = {};
const outs = {};

const locMap = {
  'Off-Site Storage': 'OS',
  'Grolier Club Library': 'GC',
};

const loanType = 'Reading room';
const matType = 'Physical';

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

try {
  if (!csvFile) { throw "Usage: node holdingsItems-grol.js <conf_file> <bib_map> <items_csv_file>" }
  let confDir = path.dirname(confFile);
  let confData = fs.readFileSync(confFile, { encoding: 'utf8' });
  let conf = JSON.parse(confData);
  ns = conf.nameSpace;
  refDir = conf.refDir.replace(/^\./, confDir);
  let hprefix = conf.hridPrefix + '';
  let iprefix = conf.hridPrefix + 'i';
  let wdir = path.dirname(csvFile);
  let fn = path.basename(csvFile, '.csv');
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

  for (let k in locMap) {
    let p = locMap[k];
    locMap[k] = refData.locations[p];
  }
  // throw(locMap);

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
      c[2] = c[2].replace(/\^\^/g, '');
      c[2] = c[2].replace(/%%/g, '|');
      if (!c[2]) c[2] = '[]';
      if (conf.callNumbersArray && c[2]) c[2] = JSON.parse(c[2]);
      let ea = (c[5]) ? JSON.parse(c[5]) : [];
      let o = { id: c[1], cn: c[2], cnt: c[3], blvl: c[4], type: c[6], cat: c[7], ea: ea }; 
      instMap[k] = o;
    }
  }
  // throw(instMap);
  // throw('');

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
    bom: true
  });
  csv = '';

  let ttl = {
    count: 0,
    holdings: 0,
    items: 0,
    errors: 0,
    itemErrors: 0
  } 
  
  const occ = {};
  const ic = {};
  const hseen = {};
  const bcseen = {};
  for (let r of inRecs) {
    ttl.count++;
    let bid = r.BIB_ID;
    let imap = instMap[bid];
    if (!imap) {
      // console.log(`ERROR instance not found for BIB_ID ${bid}`);
      ttl.errors++;
      continue;
    } else {
      instMap[bid].used = true;
    }
    let loc = r.LOCATION.trim();
    let locId = locMap[loc];
    if (r.CALL_NUMBER) {
      imap.cn.unshift(r.CALL_NUMBER);
    }
    let cn = imap.cn.shift();
    if (imap.cn[0]) {
      let newr = JSON.parse(JSON.stringify(r));
      newr.CALL_NUMBER = imap.cn.shift();
      newr.NO_ITEM = true;
      inRecs.push(newr);
    }
    let cnt = refData.callNumberTypes['Other scheme'];
    let hkey = bid + ':' + locId + ':' + cn;
    if (!occ[bid]) {
      occ[bid] = 1;
    }
    if (!hseen[hkey]) {
      let typeId = (imap.blvl === 's') ? refData.holdingsTypes.Serial : refData.holdingsTypes.Monograph;
      let occStr = occ[bid].toString().padStart(3, '0');
      let hhrid = hprefix + bid + '-' + occStr;
      let hid = uuid(hhrid, ns);
      if (!locId) {
        console.log(`ERROR location ID not found for "${loc}"`);
        ttl.errors++;
        ttl.itemErrors++;
        continue;
      }
      let h = {
        id: hid,
        hrid: hhrid,
        instanceId: imap.id,
        permanentLocationId: locId,
        sourceId: refData.holdingsRecordsSources.FOLIO,
        holdingsTypeId: typeId
      }
      if (cn) {
        h.callNumber = cn;
        h.callNumberTypeId = cnt;
      }
      writeOut(outs.holdings, h);
      hseen[hkey] = hid;
      occ[bid]++;
      ttl.holdings++;
    }

    // items start here

    if (r.NO_ITEM) continue;
    if (!ic[bid]) {
      ic[bid] = 1;
    } else {
      ic[bid]++;
    }
    let icStr = ic[bid].toString().padStart(3, '0');
    let ihrid = iprefix + bid + '-' + icStr;
    let iid = uuid(ihrid, ns);
    let i = {
      id: iid,
      hrid: ihrid,
      holdingsRecordId: hseen[hkey],
      notes: [],
    }
    if (r.BARCODE) {
      if (!bcseen[r.BARCODE]) {
        i.barcode = r.BARCODE;
        bcseen[r.BARCODE] = 1;
      } else {
        console.log(`WARN barcode ${r.BARCODE} already seen.`)
      }
    }
    if (r.COPY_NUMBER) {
      i.copyNumber = r.COPY_NUMBER;
    }
    if (r.UNITS) {
      if (imap.blvl === 's') {
        i.enumeration = r.UNITS;
      } else {
        i.volume = r.UNITS;
      }
    }
    if (r.STAFF_NOTE) {
      let o = {
        note: r.STAFF_NOTE,
        itemNoteTypeId: refData.itemNoteTypes.Note,
        staffOnly: true
      }
      i.notes.push(o);
    }
    if (r.PUBLIC_NOTE) {
      let o = {
        note: r.PUBLIC_NOTE,
        itemNoteTypeId: refData.itemNoteTypes.Note,
        staffOnly: false
      }
      i.notes.push(o);
    }
    let cin = r.CHECKIN_NOTE;
    let con = r.CHECKOUT_NOTE;
    if (cin || con) {
      let d = new Date().toISOString();
      d = d.substring(0, 10);
      i.circulationNotes = [];
      if (cin) {
        let o = {
          id: uuid(cin + 'in' + ihrid, ns),
          note: cin,
          noteType: 'Check in',
          date: d
        }
        i.circulationNotes.push(o);
      }
      if (con) {
        let o = {
          id: uuid(con + 'out' + ihrid, ns),
          note: con,
          noteType: 'Check out',
          date: d
        }
        i.circulationNotes.push(o);
      }
    }
    i.status = { name: 'Available' };
    let mtypeId = refData.mtypes[matType];
    i.materialTypeId = mtypeId;
    i.permanentLoanTypeId = refData.loantypes[loanType];
    if (i.materialTypeId) {
      if (i.permanentLoanTypeId) {
        writeOut(outs.items, i);
        ttl.items++;
      } else {
        console.log(`ERROR ITEM loan type not found for "${loanType}"`);
        ttl.itemErrors++;
      }
    } else {
      console.log(`ERROR ITEM material type not found for "${matType}"`);
      ttl.itemErrors++;
    }
  }

  const defLoc = refData.locations.GC
  for (let k in instMap) {
    let imap = instMap[k]
    if (!imap.used) {
      imap.cn.forEach(c => {
        let bid = k;
        if (!occ[bid]) {
          occ[bid] = 1;
        }
        let typeId = (imap.blvl === 's') ? refData.holdingsTypes.Serial : refData.holdingsTypes.Monograph;
        let occStr = occ[bid].toString().padStart(3, '0');
        let hhrid = hprefix + bid + '-' + occStr;
        let hid = uuid(hhrid, ns);
        let hkey = bid + ':' + defLoc + ':' + c;
        if (!hseen[hkey]) {
          let h = {
            _version: 1,
            id: hid,
            instanceId: imap.id,
            hrid: hhrid,
            holdingsTypeId: typeId,
            sourceId: refData.holdingsRecordsSources.FOLIO,
            permanentLocationId: defLoc,
            callNumber: c,
            callNumberTypeId: refData.callNumberTypes['Other scheme']
          }
          if (h.permanentLocationId && h.instanceId && h.sourceId && h.callNumberTypeId) {
            writeOut(outs.holdings, h);
            ttl.holdings++;
          } else {
            console.loc(`ERROR holdings record did not pass verification: ${bid}:${c}`);
          }
        }
        occ[bid]++;
      });
    } 
  }

  showStats();

} catch (e) {
  console.log(e);
}