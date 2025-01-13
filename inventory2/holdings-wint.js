import { parseMarc, getSubs, mij2raw, fields2mij, getSubsHash } from '../js-marc/js-marc.mjs';
import fs from 'fs';
import path from 'path';
import { v5 as uuid } from 'uuid';
import readline from 'readline';

let confFile = process.argv[2];

let refDir;
let mapFile = process.argv[3];
let rawFile = process.argv[4];
let ns;
const refData = {};
const tsvMap = {};
const outs = {};
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
  holdings: 1
};

const hstats = {
  '866': 'holdingsStatements',
  '867': 'holdingsStatementsForSupplements',
  '868': 'holdingsStatementsForIndexes',
}

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

const anotes = ['541','949cot','955'];
const hnotes = [{'583': 'Note'},{'561a':'Povanance'},{'562a':'Copy note'},{'563a':'Binding'},{'590a':'Local note'},{'500a':'Local note'}];

const inotes = [];

const writeOut = (outStream, data, notJson, newLineChar) => {
  let nl = newLineChar || '';
  let dataStr = (notJson !== undefined && notJson) ? data + nl: JSON.stringify(data) + '\n';
  outStream.write(dataStr, 'utf8');
};

const makeHoldingsMfhds = function (fields) {
  let bhrid = fields['004'][0];
  let b = seen[bhrid];
  let bid = b.id;
  let cn = b.callNumber;
  let cnt = b.callNumberType;
  let hrid = (fields['001']) ? fields['001'][0] : '';
  let hid = uuid(hrid + 'h', ns);
  let hfs = fields['852'] || [];
  if (bid && hfs[0]) {
    let hf = getSubsHash(hfs[0]);
    let loc = (hf.b) ? hf.b[0] : '';
    let locId = tsvMap.locations[loc];
    let h = {
      id: hid,
      hrid: hrid,
      instanceId: bid,
      permanentLocationId: locId
    };
    if (cn) {
      h.callNumber = cn;
      h.callNumberTypeId = cnt || '6caca63e-5651-4db6-9247-3205156e9699'; // other schema
    }
    if (b.ea) {
      h.electronicAccess = [];
      b.ea.forEach(o => {
        h.electronicAccess.push(o);
      });
    }
    h.administrativeNotes = [];
    anotes.forEach(f => {
      let t = f.substring(0,3);
      let c = f.substring(3);
      if (fields[t]) {
        fields[t].forEach(x => {
          let data = getSubs(x, c);
          if (data) h.administrativeNotes.push(data);
        });
      }
    });
    h.notes = []
    hnotes.forEach(o => {
      let f = Object.keys(o)[0];
      let t = f.substring(0,3);
      let c = f.substring(3);
      let type = o[f];
      if (fields[t]) {
        fields[t].forEach(x => {
          let data = getSubs(x, c);
          if (data) h.notes.push(data);
        });
      }
    });
    return h;
  } else {
    console.log(`ERROR instanceId not found for holdings ${hrid}`);
    return '';
  }
}

try {
  if (!rawFile) { throw "Usage: node holdings-wint.js <conf_file> <instance_map> <mfhd_mrc_file>" }
  let confDir = path.dirname(confFile);
  let confData = fs.readFileSync(confFile, { encoding: 'utf8' });
  let conf = JSON.parse(confData);
  ns = conf.nameSpace;
  refDir = conf.refDir.replace(/^\./, confDir);
  
  let wdir = path.dirname(rawFile);
  let fn = path.basename(rawFile, '.mrc');
  let outBase = wdir + '/' + fn;
  for (let f in files) {
    let p = (f === 'err') ? outBase + '-' + f + '.mrc' : (f === 'idmap') ? outBase + '.map' : outBase + '-' + f + '.jsonl';
    files[f] = p;
    if (fs.existsSync(p)) fs.unlinkSync(p);
    outs[f] = fs.createWriteStream(p)
  };

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
          let v = c[2];
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
      c[2] = c[2].replace(/^\^\^/, '');
      let ea = (c[5]) ? JSON.parse(c[5]) : [];
      let o = { id: c[1], cn: c[2], cnt: c[3], blvl: c[4], type: c[6], ea: ea }; 
      instMap[k] = o;
    }
  }
  // throw(instMap);

  for (let p in imaps) {
    for (let k in imaps[p]) {
      let c = imaps[p][k];
      imaps[p][k] = refData.mtypes[c];
    }
  }  
  // throw(imaps);
  
  let ttl = {
    count: 0,
    holdings: 0,
    errors: 0
  }

  let start = new Date().valueOf();

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
      ttl.count++
      let r = recs[k];
      let m = parseMarc(r);
      let f = m.fields
      let hrid = (f['001']) ? f['001'][0] : '';
      let bid = (f['004']) ? f['004'][0] : '';
      let inst = instMap[bid];
      if (!inst) {
        console.log(`ERROR instanceId not found for ${bid}`);
        ttl.errors++;
        continue;
      }
      let loc = (f['852']) ? getSubs(f['852'][0], 'b') : '';
      let locId = refData.locations[loc];
      let h = {
        id: uuid(hrid, ns),
        hrid: hrid,
        instanceId: inst.id,
        permanentLocationId: locId,
        sourceId: 'f32d531e-df79-46b3-8932-cdd35f7a2264',
        holdingsTypeId: refData.holdingsTypes.Serial
      }
      if (inst.cn) { 
        h.callNumber = inst.cn;
        h.callNumberTypeId = inst.cnt;
      }
      if (inst.ea && inst.ea[0]) {
        h.electronicAccess = inst.ea;
      }
      for (let tag in hstats) {
        let prop = hstats[tag];
        if (f[tag]) {
          if (!h[prop]) h[prop] = [];
          f[tag].forEach(ff => {
            let subs = getSubsHash(ff, true);
            let text = subs.a;
            let pnote = subs.z;
            let snote = subs.x
            if (text) {
              let o = {
                statement: text
              }
              if (pnote) o.note = pnote;
              if (snote) o.staffNote = snote;
              h[prop].push(o);
            }
          });
        }
      }
      console.log(h);
      writeOut(outs.holdings, h);
      ttl.holdings++;
    }
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