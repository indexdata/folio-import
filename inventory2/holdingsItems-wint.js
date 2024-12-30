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
}

const imaps = {
  types: {
    "a": "Book",
    "c": "Musical score",
    "d": "Musical score",
    "e": "Cartographic material",
    "f": "Cartographic material",
    "g": "Projected image",
    "i": "Sound recording",
    "j": "Sound recording",
    "k": "Image",
    "m": "Electronic resource",
    "o": "Game or kit",
    "p": "Mixed materials",
    "r": "Realia",
    "t": "Manuscript"
  },
  cats: {
    "a": "Cartographic material",
    "c": "Electronic resource",
    "g": "Projected image",
    "h": "Microform",
    "k": "Image",
    "m": "Videorecording",
    "o": "Game or kit",
    "q": "Musical score",
    "s": "Sound recording",
    "v": "Videorecording",
    "z": "Unspecified"
  }
};

const inotes = [];

const writeOut = (outStream, data, notJson, newLineChar) => {
  let nl = newLineChar || '';
  let dataStr = (notJson !== undefined && notJson) ? data + nl: JSON.stringify(data) + '\n';
  outStream.write(dataStr, 'utf8');
};

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
  if (!csvFile) { throw "Usage: node holdingsItems-wint.js <conf_file> <bib_map> <mfhd_jsonl_file>" }
  let confDir = path.dirname(confFile);
  let confData = fs.readFileSync(confFile, { encoding: 'utf8' });
  let conf = JSON.parse(confData);
  ns = conf.nameSpace;
  refDir = conf.refDir.replace(/^\./, confDir);
  let prefix = conf.hridPrefix || '';
  let hprefix = conf.hridPrefix + '';
  let iprefix = conf.hridPrefix + 'i';
  let wdir = path.dirname(csvFile);
  let fn = path.basename(csvFile, '.jsonl');
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
          let k = (prop === 'locations') ? c[1] : c[0];
          let v = c[2];
          tsvMap[prop][k] = refData[prop][v];
        });
      }
    });
  }
  // throw(tsvMap);

  for (let p in imaps) {
    for (let k in imaps[p]) {
      let c = imaps[p][k];
      imaps[p][k] = refData.mtypes[c];
    }
  }  
  // throw(imaps);
  
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
    holdings: 0,
    items: 0,
    errors: 0
  } 
  
  const occ = {};
  const ic = {};
  const hseen = {};
  const bcseen = {};
  for (let r of inRecs) {
    let bid = r.BIB_ID;
    let imap = instMap[bid];
    if (!imap) {
      console.log(`ERROR instance not found for BIB_ID ${bid}`);
      ttl.errors++;
      continue;
    }
    let loc = r.LOCATION.trim();
    let cn = r.CALL_NUMBER || imap.cn;
    let cnt = (r.CALL_NUMBER) ? refData.callNumberTypes['Other scheme'] : imap.cnt;
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
        console.log(`ERROR location ID not found for "${loc}"`);
        ttl.errors++;
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
        h. callNumberTypeId = cnt;
      }
      writeOut(outs.holdings, h);
      hseen[hkey] = hid;
      occ[bid]++;
      ttl.holdings++;
    }

    // items start here

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
    i.materialTypeId = refData.mtypes.Unspecified;
    i.permanentLoanTypeId = refData.loantypes['Can circulate'];
    writeOut(outs.items, i);
    ttl.items++;
  }

  /*
    This is the item creation section
  */

  showStats();

} catch (e) {
  console.log(e);
}