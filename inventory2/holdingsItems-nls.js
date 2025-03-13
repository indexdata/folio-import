import fs from 'fs';
import path from 'path';
import { v5 as uuid } from 'uuid';
import readline from 'readline';
import { parse } from 'csv-parse';

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

const files = {
  holdings: 1,
  items: 1,
  bwp: 1,
  rel: 1
};

const itemFiles = {
  items: 'items.tsv',
  links: 'links.tsv'
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

const wait = (ms) => {
  console.log(`(Waiting ${ms}ms...)`);
  return new Promise((resolve) => setTimeout(resolve, ms));
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
  if (!mapFile) { throw "Usage: node holdingsItems-stc.js <conf_file> <instance_map_file>" }
  let confDir = path.dirname(confFile);
  let confData = fs.readFileSync(confFile, { encoding: 'utf8' });
  let conf = JSON.parse(confData);
  ns = conf.nameSpace;
  refDir = conf.refDir.replace(/^\./, confDir);
  let prefix = conf.hridPrefix || '';
  let hprefix = prefix + 'h';
  let iprefix = prefix + 'i';
  let wdir = path.dirname(mapFile);
  let fn = path.basename(mapFile, '.map');
  let outBase = wdir + '/' + fn;
  for (let f in files) {
    let p = (f === 'err') ? outBase + '-' + f + '.mrc' : (f === 'idmap') ? outBase + '.map' : outBase + '-' + f + '.jsonl';
    files[f] = p;
    if (fs.existsSync(p)) fs.unlinkSync(p);
    outs[f] = fs.createWriteStream(p)
  }

  let start = new Date().valueOf();

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
          p.code = p.code.toLowerCase().trim();
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

  const instMap = {};
  if (conf.makeInstMap) {
    let fileStream = fs.createReadStream(mapFile);
    let rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });
    for await (let line of rl) {
      let c = line.split(/\|/);
      let k = c[0];
      instMap[k] = { id: c[1], blvl: c[4], type: c[6], ea: c[5] };
    }
  }
  // throw(instMap);

  // map link files;
  console.log(`Reading linker data from ${itemFiles.links}`);
  const linkMap = {};
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

  let ttl = {
    holdings: 0,
    items: 0,
    boundwiths: 0,
    relationships: 0,
    errors: 0,
    itemErrors: 0
  }


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
  const occ = {};

  const makeHoldingsItems = (r) => {
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
    let col = r.Z30_COLLECTION;
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
          holdingsTypeId: htypeId
        }
        if (cn) { 
          h.callNumber = cn;
          h.callNumberTypeId = refData.callNumberTypes['Other scheme'];
        }

        if (h.permanentLocationId) {
          writeOut(outs.holdings, h);
          ttl.holdings++;
        } else {
          console.log(`ERROR permanentLocationId not found for ${loc}!`)
        }
        hseen[hkey] = { id: hid, cn: cn };
        // console.log(h);
      }
    } else {
      console.log(`ERROR instance not found for ${r.Z30_REC_KEY}!`);

    }
  };
  
  fileStream = fs.createReadStream(itemFiles.items);
  const parser = parse({
    delimiter: '\t',
    columns: true,
    relax_column_count: true,
    trim: true
  });
  fileStream.pipe(parser);
  parser.on('data', (rec) => {
    makeHoldingsItems(rec);
  });
  parser.on('end', () => {
    showStats();
    console.log(hseen);
  })

} catch (e) {
  console.log(e);
}