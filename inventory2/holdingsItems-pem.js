import fs from 'fs';
import path from 'path';
import { v5 as uuid } from 'uuid';
import readline from 'readline';
import { parse } from 'csv-parse/sync';

let confFile = process.argv[2];

let refDir;
let mfhdFile = process.argv[3];
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
  items: 1,
  bwp: 1
};

const itemFiles = {
  item: 'item.csv',
  bc: 'item_barcode.csv',
  mfhd: 'mfhd_item.csv',
  note: 'item_note.csv',
  stat: 'item_status.csv',
  loc: 'location.csv'
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
  if (!mfhdFile) { throw "Usage: node holdingsItems-pem.js <conf_file> <mfhd_jsonl_file>" }
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
  for (let f in itemFiles) {
    let path = wdir + '/' + itemFiles[f];
    if (!fs.existsSync(path)) {
      throw new Error(`ERROR Can't find require file ${path}`);
    }
    itemFiles[f] = path;
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
            let v = c[2].trim();
            if (!v || v.match(/Checked out|Paged|Aged to lost/)) v = 'Available';
            tsvMap[prop][k] = v;
          } else {
            let v = (prop === 'mtypes') ? c[2] : c[1];
            v = v.trim();
            if (refData[prop] && k && v) tsvMap[prop][k] = refData[prop][v];
          }
        });
      }
    });
  }
  // throw(tsvMap);
  
  const instMap = {};
  if (conf.makeInstMap) {
    console.log(fn);
    let mfn = fn.replace(/^(.+)-.+/, wdir + '/$1.map');
    let fileStream = fs.createReadStream(mfn);
    let rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });
    for await (let line of rl) {
      let c = line.split(/\|/);
      let k = c[0].substring(1);
      instMap[k] = c[1];
    }
  }
  // console.log(instMap);

  let ttl = {
    holdings: 0,
    items: 0,
    boundwiths: 0,
    errors: 0
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
      l = l.padEnd(12);
      let n = ttl[x].toString().padStart(8);
      console.log(l, ':', n);
    }
  }

  // map barcodes
  let csv = fs.readFileSync(itemFiles.bc, { encoding: 'utf8' });
  let vrecs = parse(csv, {
    columns: true,
    skip_empty_lines: true
  });
  csv = '';
  let bcMap = {};
  let bcMapRev = {};
  console.log('INFO Creating barcode map...');
  let rc = 0;
  for (let x in vrecs) {
    let r = vrecs[x];
    if (r.BARCODE_STATUS === '1') {
      bcMap[r.ITEM_ID] = r.ITEM_BARCODE;
      bcMapRev[r.ITEM_BARCODE] = r.ITEM_ID;
      rc++;
    }
  }
  console.log(`INFO ${rc} barcodes mapped.`);
  // throw(bcMapRev);

  const hseen = {};
  const bwMap = {};

  let fileStream = fs.createReadStream(mfhdFile);
  let rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });
  for await (let line of rl) {
    let m = JSON.parse(line);
    let ctrl = (m['001']) ? m['001'][0] : '';
    let bhrid = (m['004']) ? m['004'][0] : '';
    let mh = {};
    let iid = '';
    if (m['852']) {
      m['852'][0].subfields.forEach(s => {
        let k = Object.keys(s)[0];
        if (k.match(/[zx]/)) {
          if (!mh[k]) mh[k] = [];
          mh[k].push(s[k]);
        } else {
          mh[k] = s[k];
        }
        if (k === 'p') {
          let bc = s[k];
          if (bcMapRev[bc]) {
            iid = bcMapRev[bc];
          }
        }
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
    let hhrid;
    if (ctrl) {
      hhrid = hprefix + ctrl;
    }
    let hid = uuid(hhrid, ns);
    if (!bwMap[iid]) bwMap[iid] = [];
    bwMap[iid].push(hid);
    let h = {
      _version: 1,
      id: hid,
      hrid: hhrid,
      sourceId: refData.holdingsRecordsSources.FOLIO,
      holdingsTypeId: typeId,
      formerIds: [ ctrl ]
    }
    h.instanceId = instMap[bhrid];
    h.permanentLocationId = tsvMap.locations[loc] || '';
    if (cn) {
      h.callNumber = cn;
      h.callNumberTypeId = cnTypeMap[mh.ind1] || cnTypeMap['8'];
    }
    h.notes = [];
    let ntype = refData.holdingsNoteTypes.Note;
    if (mh.x) {
      mh.x.forEach(n => {
        let o = makeNote(n, ntype, true);
        h.notes.push(o);
      });
    }
    if (mh.z) {
      mh.z.forEach(n => {
        let o = makeNote(n, ntype, false);
        h.notes.push(o);
      });
    }

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
          } else if (s.y) {
            o.linkText = s.y;
          } else if (s.z) {
            o.publicNote = s.z;
          }
          o.relationshipId = rid;
        });
        h.electronicAccess.push(o);
      });
    }

    h.holdingsStatements = [];
    let hst = m['866'] || [];
    hst.forEach(f => {
      let o = {};
      f.subfields.forEach(s => {
        if (s.a) {
          o.statement = s.a;
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
        }
      });
      h.holdingsStatementsForIndexes.push(o);
    });

    if (h.instanceId) {
      if (h.permanentLocationId) {
        if (!hseen[ctrl]) {
          ttl.holdings++;
          writeOut(outs.holdings, h);
          hseen[ctrl] = h.id;
        } else {
          console.log(`ERROR hrid ${hhrid} already used!`);
        }
      } else {
        console.log(`ERROR location not found for "${loc}" (${hhrid})`);
        ttl.errors++;
      }
    } else {
      console.log(`ERROR instance "${bhrid}" not found for ${hhrid}`);
      ttl.errors++;
    }
  }
  // throw(bwMap);

  /*
    This is the item creation section
  */

  
  vrecs = [];

  // map statuses
  csv = fs.readFileSync(itemFiles.stat, { encoding: 'utf8' });
  vrecs = parse(csv, {
    columns: true,
    skip_empty_lines: true
  });
  csv = '';
  let stMap = {};
  console.log('INFO Creating status map...');
  rc = 0;
  for (let x in vrecs) {
    let r = vrecs[x];
    stMap[r.ITEM_ID] = tsvMap.statuses[r.ITEM_STATUS];
    rc++;
  }
  console.log(`INFO ${rc} statuses mapped.`);
  vrecs = [];

  // map item temp locations
  csv = fs.readFileSync(itemFiles.loc, { encoding: 'utf8' });
  vrecs = parse(csv, {
    columns: true,
    skip_empty_lines: true
  });
  csv = '';
  let locMap = {};
  rc = 0;
  for (let x in vrecs) {
    let r = vrecs[x];
    let c = r.LOCATION_CODE
    locMap[r.LOCATION_ID] = tsvMap.locations[c];
    rc++;
  }
  vrecs = [];

  // map notes
  csv = fs.readFileSync(itemFiles.note, { encoding: 'utf8' });
  vrecs = parse(csv, {
    columns: true,
    skip_empty_lines: true
  });
  csv = '';
  let ntMap = {};
  console.log('INFO Creating note map...');
  rc = 0;
  for (let x in vrecs) {
    let r = vrecs[x];
    if (!ntMap[r.ITEM_ID]) ntMap[r.ITEM_ID] = [];
    ntMap[r.ITEM_ID].push(r.ITEM_NOTE);
    rc++;
  }
  console.log(`INFO ${rc} notes mapped.`);
  vrecs = [];

  // map mfhd
  csv = fs.readFileSync(itemFiles.mfhd, { encoding: 'utf8' });
  vrecs = parse(csv, {
    columns: true,
    skip_empty_lines: true
  });
  csv = '';
  const mmap = {};
  console.log('INFO Creating mfhds map...');
  rc = 0;
  for (let x in vrecs) {
    let r = vrecs[x];
    let iid = r.ITEM_ID;
    delete r.ITEM_ID;
    for (let p in r) {
      if (!r[p]) delete r[p];
    }
    let bc = bcMap[iid];
    if (bc) {
      r.BARCODE = bc;
    }
    let nts = ntMap[iid];
    if (nts) {
      r.NOTES = nts;
    }
    let sts = stMap[iid];
    if (sts) {
      r.STATUS = sts;
    }
    mmap[iid] = r;
    rc++;
  }
  console.log(`INFO ${rc} mfhds mapped.`);
  bcMap = {};
  ntMap = {};
  stMap = {};
  vrecs = [];
  // throw(mmap);

  csv = fs.readFileSync(itemFiles.item, { encoding: 'utf8' });
  let items = parse(csv, {
    columns: true,
    skip_empty_lines: true
  });
  csv = '';
  rc = 0;
  let bcseen = {};
  let bwseen = {};
  for (let x in items) {
    let r = items[x];
    let iid = r.ITEM_ID;
    let id = uuid(iid, ns);
    let hrid = iprefix + iid;
    let m = mmap[iid];
    let vhid = (m) ? m.MFHD_ID : '';
    let hid = hseen[vhid];
    if (hid) {
      let i = {
        _version: 1,
        id: id,
        hrid: hrid,
        holdingsRecordId: hid,
        formerIds: [ iid ],
        status: { name: 'Available' },
        notes: []
      };
      let bc = m.BARCODE || 'TEMP' + iid;
      if (!bcseen[bc]) {
        i.barcode = bc;
        if (!m.BARCODE) {
          let o = {
            note: 'Barcode added during migrations.',
            itemNoteTypeId: refData.itemNoteTypes.Note,
            staffOnly: true
          }
          i.notes.push(o);
        }
        bcseen[bc] = iid;
      } else {
        i.barcode = 'TEMP' + iid;
        let o = {
          note: `Barcode ${bc} already used by pi${bcseen[bc]}. Using ITEM_ID instead.`,
          itemNoteTypeId: refData.itemNoteTypes.Note,
          staffOnly: true
        }
        i.notes.push(o);
        console.log(`WARN barcode ${bc} already used by ITEM_ID ${bcseen[bc]}`);
      }
      if (m.ITEM_ENUM) i.volume = m.ITEM_ENUM;
      if (m.CHRON) i.chronology = m.CHRON;
      if (m.YEAR) i.yearCaption = [ m.YEAR ];
      if (r.COPY_NUMBER) i.copyNumber = r.COPY_NUMBER;
      if (r.PIECES) i.numberOfPieces = r.PIECES;
      let nts = m.NOTES || [];
      nts.forEach(n => {
        let o = {
          note: n,
          itemNoteTypeId: refData.itemNoteTypes.Note
        };
        i.notes.push(o);
      });
      if (m.STATUS) i.status.name = m.STATUS;
      let vtype = r.ITEM_TYPE_ID;
      i.materialTypeId = tsvMap.mtypes[vtype];
      i.permanentLoanTypeId = refData.loantypes.Standard;
      let tloc = locMap[r.TEMP_LOCATION];
      if (tloc) i.temporaryLocationId = tloc;
      if (i.materialTypeId) {
        if (i.permanentLoanTypeId) {
          writeOut(outs.items, i);
          if (bwMap[iid]) {
            /*
            if (!bwseen[iid]) {
              let mainBwp = {
                id: uuid(i.holdingsRecordId, i.id),
                holdingsRecordId: i.holdingsRecordId,
                itemId: i.id
              }
              writeOut(outs.bwp, mainBwp);
              ttl.boundwiths++;
            }
            */
            bwMap[iid].forEach(hid => {
              let bwp = {
                id: uuid(hid, i.id),
                holdingsRecordId: hid,
                itemId: i.id
              }
              writeOut(outs.bwp, bwp);
              ttl.boundwiths++;
              bwseen[iid] = 1;
              // console.log(bwp);
            })
            
          }
        } else {
          console.log(`ERROR loantype not found for ${iid}`);
        }
      } else {
        console.log(`ERROR material type "${vtype}" not found for ${iid}`);
      }
      ttl.items++;
    }
  }

  showStats();

} catch (e) {
  console.log(e);
}