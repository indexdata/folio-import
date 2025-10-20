import fs from 'fs';
import path from 'path';
import { v5 as uuid } from 'uuid';
import readline from 'readline';
import { parse } from 'csv-parse';

let confFile = process.argv[2];
let mapFile = process.argv[3];
let args = process.argv.slice(4);
let filters = {};
let hasFilters = false;
let shortCol = { l: 'Z30_SUB_LIBRARY', s: 'Z30_ITEM_STATUS', p: 'Z30_ITEM_PROCESS_STATUS', m: 'Z30_MATERIAL' };
args.forEach(a => {
  if (a.match(/^--Z30_/)) {
    a = a.replace(/^--/, '');
    let [ k, v ] = a.split(/=/);
    filters[k] = v;
  } else if (a.match(/^-\w/)) {
    a = a.replace(/^-+/, '');
    let [ k, v ] = a.split(/=/);
    let n = shortCol[k];
    filters[n] = v;
  }
  hasFilters = true;
});
// throw(filters);

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

const cnoteTypes = [ 'Check in' ];

let today = new Date().toISOString().replace(/T.+/, 'T12:00:00.000+0000');

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
  suppress: 1
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

try {
  if (!mapFile) { throw "Usage: node holdingsItems-stc.js <conf_file> <instance_map_file> [filters: --Z30_WHATEVER=whatever | -l=<sublibrary>, -s=<status>, -p=<process_status> -m=<material>]" }
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
          // if (prop === 'loantypes') p.name = p.name.replace(/^(.+)\/.+$/, '$1'); 
          p.name = p.name.trim();
          refData[prop][p.name] = p.id;
        }
      });
    } catch {}
  });
  const refLoc = refData.locations;
  // throw(refLoc);

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
            if (c[1] === 'all') c[1] = '';
            k += `:${c[1]}:${c[2]}:${c[3]}:${c[4]}`;
            k = k.replace(/:+$/, '');
            v = c[8].toLowerCase().trim();
          } else if (k && prop === 'loantypes') {
            let cb = (c[1] && c[1].match(/\w/)) ? c[1].padStart(2, '0') : '_';
            let cc = c[2] || '_';
            let p = c[5].trim();
            let t = c[6].trim();
            if (!tsvMap[prop][k]) tsvMap[prop][k] = {};
            if (cb && !tsvMap[prop][k][cb]) tsvMap[prop][k][cb] = {};
            if (cc && !tsvMap[prop][k][cc]) tsvMap[prop][k][cb][cc] = {};
            if (cb && cc) {
              if (p) tsvMap[prop][k][cb][cc].p = p;
              if (t) tsvMap[prop][k][cb][cc].t = t;
            }
          } else if (c[1]) {
            v = c[1].trim();
          }
          if (k && v) tsvMap[prop][k] = refData[prop][v];
        });
      }
    });
  }
  // throw(JSON.stringify(tsvMap.locations, null, 2));

  console.log(`INFO Parsing instance map at ${mapFile}`);
  const instMap = {};
  if (conf.makeInstMap) {
    let fileStream = fs.createReadStream(mapFile);
    let rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });
    let mc = 0;
    for await (let line of rl) {
      mc++;
      let c = line.split(/\x1E/);
      let k = c[0];
      instMap[k] = { id: c[1], blvl: c[4], type: c[6], ea: c[5], af: c[7] };
      if (mc % 1000000 === 0) console.log('Map lines read:', mc);
    }
    console.log('Instances mapped:', mc);
  }
  // throw(instMap['000694902']);

  // map link files;
  console.log(`INFO Reading linker data from ${itemFiles.links}`);
  const linkMap = {};
  let fileStream = fs.createReadStream(itemFiles.links);
  let rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });
  let lc = 0;
  let mc = 0;
  const linkSeq = {};
  for await (let line of rl) {
    lc++;
    let c = line.split(/\t/);
    let k = c[0].substring(5, 14);
    let seq = c[0].substring(14);
    if (c[2] === 'KBS01' && c[4] === 'ADM') {
      linkMap[k] = c[3];
      mc++;
    }
    if (lc % 1000000 === 0) {
      console.log('Linker lines read:', lc, `(${mc})`);
    }
  }
  console.log('Links mapped:', mc);
  // throw(linkMap);

  let ttl = {
    linesRead: 0,
    holdings: 0,
    items: 0,
    instanceSupp: 0,
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
  const dseen = {};
  const bcseen = {};
  const occ = {};

  const makeHoldingsItems = (r) => {
    for (let k in filters) {
      if (r[k] !== filters[k]) {
        return;
      }
    }
    let aid = r.Z30_REC_KEY.substring(0, 9);
    let iid = r.Z30_REC_KEY;
    let bid =  linkMap[aid];
    let inst = instMap[bid];
    console.log(inst);
    let bc = r.Z30_BARCODE;
    let mt = r.Z30_MATERIAL;
    let st = r.Z30_ITEM_STATUS;
    let cn = r.Z30_CALL_NO;
    let ct = r.Z30_CALL_NO_TYPE;
    let col = r.Z30_COLLECTION || '';
    let ips = r.Z30_ITEM_PROCESS_STATUS;
    let loc = r.Z30_SUB_LIBRARY;
    let noLoans = r.Z30_NO_LOANS;
    let locKey = (loc.match(/TLKB|MFL|REF|PRUMS/)) ? loc : loc + ':' + st;
    let locId;
    if (col === '400') { 
      locId = refData.locations['loc-hs'];
    } else if (cn.match(/Astrid Lindgrensamlingen/i)) {
      locId = refData.locations['loc-al'];
    } else if (loc === 'RRLEX' && st === '02' && ips === 'SN') {
      locId = refData.locations['loc-hem'];
    } else if (loc.match(/^(RRLEX|RRSPE)/) && st === '72') {
      locId = (mt === 'BOOK') ? refData.locations['loc-des'] : refData.locations['loc-ts'];
    } else if (loc === 'REF' && st === '72') {
      locId = refData.locations['loc-ref']
    } else {
      locId = tsvMap.locations[locKey] || refData.locations.datamigration;
    }
    
    if (inst) {
      let hkey = bid + ':' + locId;
      if ((loc === 'ENHET' && st === '73') || (loc === 'RRLEX' && (st === '31' || st === '32')) || cn === 'AVM') {
        if (!suppMap[bid]) {
          suppMap[bid] = 1;
          writeOut(outs.suppress, { [bid]: 1 });
          ttl.instanceSupp++;
        }
      }

      // item administrativeNotes from the bib 852 field
      let af = (inst.af) ? JSON.parse(inst.af) : {};
      let anf = af['852'] || [];
      let adminNotes = {};
      let inotes = [];
      anf.forEach(f => {
        let str = '';
        let l = f['5'];
        if (l === 'SRo') {
          if (locId === refData.locations['loc-ref']) str = f.string;
        } else if (l === 'S') {
          if (f.h && f.h.match(/^RefKB/)) {
            if (locId === refData.locations['loc-ref']) str = f.string;
          } else if (f.h && f.h.match(/^Astrid Lindgrensamlingen/)) {
            if (locId === refData.locations['loc-al']) str = f.string;
          } else if (locId === refLoc['loc-des'] || locId === refLoc['loc-hs'] || locId === refLoc['loc-ts'] || locId === refLoc['loc-vt'] || locId === refLoc['loc-prum'] || locId === refLoc['loc-tls'] || locId === refLoc['loc-tlkb'] || locId === refLoc['ldc-hem']) {
            str = f.string;
          }
        }
        if (str) {
            if (!adminNotes[locId]) adminNotes[locId] = [];
            adminNotes[locId].push(str);
        }
      });

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
        if (dbug) h.__ = r;

        let hsf = af['866'] || [];
        if (hsf[0]) h.holdingsStatements = [];
        hsf.forEach(f => {
          let o = {};
          if (f.a) o.statement = f.a;
          if (f.z) o.note = f.z;
          if (f.x) o.staffNote = f.x;
          if (o.statement || o.note) h.holdingsStatements.push(o);
        });

        let pnf = af['561'] || [];
        pnf.forEach(f => {
          let t = refData.holdingsNoteTypes.Provenance;
          let o = makeHoldingsNote(f, t);
          if (f && t) h.notes.push(o)
        });

        let snf = af['520'] || [];
        snf.forEach(f => {
          let t = refData.holdingsNoteTypes.Note;
          let o = makeHoldingsNote(f, t);
          if (f && t) h.notes.push(o)
        });

        if (inst.ea) {
          let ea = JSON.parse(inst.ea);
          h.electronicAccess = ea;
        }

        if (h.permanentLocationId) {
          writeOut(outs.holdings, h);
          ttl.holdings++;
          hseen[hkey] = { id: hid, cn: cn };
          if (h.permanentLocationId === refData.locations['loc-des']) {
            dseen[bid] = 1;
          }
        } else {
          console.log(`ERROR permanentLocationId not found for ${loc}!`);
          ttl.errors++;
        }
      }

      let hr = hseen[hkey];
      if (hr) {
        let nt = { p: [], s: []};
        if (inotes[0]) nt.p = inotes;
        let i = {
          _version: 1,
          id: uuid(iid, ns),
          hrid: iid,
          holdingsRecordId: hr.id,
          discoverySuppress: false,
          notes: [],
          status: { name: 'Available' }
        };
        if (inotes[0]) i.__ = 'znote';
        let istat = r.Z30_ITEM_STATISTIC || '';
        let bc = r.Z30_BARCODE;
        let desc = r.Z30_DESCRIPTION || '';
        let en = r.Z30_ENUMERATION_A || '';
        if (r.Z30_NOTE_OPAC) nt.p.push(r.Z30_NOTE_OPAC);
        if (r.Z30_NOTE_INTERNAL) nt.s.push(r.Z30_NOTE_INTERNAL);
        let cnote = r.Z30_NOTE_CIRCULATION
        let mt = r.Z30_MATERIAL;
        let chdate = r.Z30_DATE_LAST_RETURN;
        let chhour = r.Z30_HOUR_LAST_RETURN;

        if (st === '05') i.discoverySuppress = true;
        if (ips.match(/^NA|CL$/)) i.discoverySuppress = true;
        // if (desc) i.displaySummary = desc;
        if (istat === 'TG') i.accessionNumber = 'RFID';
        if (bc && !bcseen[bc]) {
          i.barcode = bc;
          bcseen[bc] = 1;
        } else if (bc) {
          console.log(`WARN ITEM barcode "${bc}" already used!`);
        }
        if (cn) {
          i.itemLevelCallNumber = cn;
          i.itemLevelCallNumberTypeId = refData.callNumberTypes['Other scheme'];
        }
        if (desc || en) {
          i.enumeration = desc || en;
        }
        if (adminNotes[locId]) i.administrativeNotes = adminNotes[locId];

        if (ips.match(/^(FK)$/)) {
          i.status.name = 'Missing';
        } else if (ips.match(/^(NA|UL|CL)$/)) {
          i.status.name = 'On order';
          if (ips === 'CL') {
            nt.s.push('Reklamerad');
          }
        } else if (st === '72' || st === '71') {
          i.status.name = 'Long missing';
        } else if (!(loc === 'TLKB' && st === '04') && ips === 'UA') {
          i.status.name = 'In process';
        } else if (st === '71' && loc.match(/^(RRLEX|RRSPE)$/)) {
          i.status.name = 'Long missing';
        } else if (st === '72' && loc === 'RRLEX') {
          i.status.name = 'Intellectual item';
        } else if (st === '05' && loc === 'RRLEX') {
          i.status.name = 'Restricted';
        }

        if (loc === 'RRSPE' && st === '21' && ips === 'DS') {
          nt.p.push('Läses digitalt på läsplatta');
        } else if (loc === 'RRSPE' && st === '28' && ips === 'RP') {
          nt.p.push('Spärrad av bevarandeskäl');
          i.status.name = 'Restricted';
        } else if (loc === 'RESTR') {
          if ((st === '03' || st === '22') && ips === 'RP') {
            nt.p.push('Spärrad av bevarandeskäl');
          } else if (st === '22') {
            nt.p.push('Annat ex finns');
          }
          if (st.match(/03|22|23/)) {
            i.status.name = 'Restricted';
          }
        } else if ((loc === 'PRUMS' && st === '05') || (loc === 'ENHET' && st === '73')) {
          i.discoverySuppress = true
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
        if (noLoans) {
          let tstr = 'Aleph check out count';
          let t = refData.itemNoteTypes[tstr];
          if (t) {
            let o = makeNote(noLoans, t, true);
            i.notes.push(o);
          } else {
            console.log(`WARN ITEM note type for "${tstr}" not found (${iid})`);
          }
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

        let ltypes = (tsvMap.loantypes[loc] && tsvMap.loantypes[loc][st]) ? tsvMap.loantypes[loc][st][ips] || tsvMap.loantypes[loc][st]._ : '';
        let pl = ltypes.p;
        let tl = ltypes.t;
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
          console.log(`ERROR ITEM permanantLoanType not found for "${loc}:${st}:${ips} (${iid})"!`);
          ttl.itemErrors++;
        }
      }
      
    } else {
      // console.log(`ERROR instance not found for ${r.Z30_REC_KEY}!`);
    }
  }
  
  fileStream = fs.createReadStream(itemFiles.items);
  const parser = parse({
    delimiter: '\t',
    columns: true,
    relax_column_count: true,
    trim: true,
    quote: false
  });
  fileStream.pipe(parser);
  parser.on('data', (rec) => {
    ttl.linesRead++;
    makeHoldingsItems(rec);
    if (ttl.linesRead % 100000 === 0) console.log(`(Z30 lines read: ${ttl.linesRead})`);
  });
  parser.on('end', () => {
    if (!hasFilters) {
      for (let bhrid in instMap) {
        let inst = instMap[bhrid];
        if (inst.af) {
          let af  = JSON.parse(inst.af);
          let f = af['852'] || [];
          let o = occ[bhrid] || 0;
          f.forEach(s => {
            o++;
            let ostr = o.toString().padStart(3, 0);
            if (s.x && s.x.match(/Desiderata/) && !dseen[bhrid]) {
              let hrid = bhrid + '-' + ostr;
              let h = {
                _version: 1,
                __: 'dummyHoldings',
                id: uuid(hrid, ns),
                hrid: hrid,
                instanceId: inst.id,
                sourceId: refData.holdingsRecordsSources.FOLIO,
                permanentLocationId: refData.locations['loc-des'],
                callNumber: s.x,
                callNumberTypeId: refData.callNumberTypes['Other scheme'],
                notes: []
              }
              if (s.z) {
                let o = {
                  note: s.z,
                  holdingsNoteTypeId: refData.holdingsNoteTypes['Note'],
                  staffOnly: false
                }
                h.notes.push(o);
              }
              writeOut(outs.holdings, h);
              ttl.holdings++;

            } else if (s.z && s.z.match(/Förvärvas ej av KB/)) {
              let hrid = bhrid + '-' + ostr;
              let h = {
                _version: 1,
                __: 'dummyHoldings (LOC-EJ)',
                id: uuid(hrid, ns),
                hrid: hrid,
                instanceId: inst.id,
                sourceId: refData.holdingsRecordsSources.FOLIO,
                permanentLocationId: refData.locations['loc-ej'],
                notes: [{
                  note: s.z,
                  holdingsNoteTypeId: refData.holdingsNoteTypes['Libris beståndsinformation'],
                  staffOnly: false
                }],
                discoverySuppress: false 
              }
              writeOut(outs.holdings, h);
              ttl.holdings++;
              if (!suppMap[bhrid]) {
                suppMap[bhrid] = 1;
                writeOut(outs.suppress, { [bhrid]: 1 });
                ttl.instanceSupp++;
              }
            }
          });
        }
      }
    }
    showStats();
  });
} catch (e) {
  console.log(e);
}