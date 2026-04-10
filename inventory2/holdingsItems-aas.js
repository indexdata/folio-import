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
const suppMap = {};
const outs = {};
const dbug = process.env.DEBUG || '';

const tsvCols = {
  locations: [0, 2],
  mtypes: [0, 1],
  statuses: [1, 4],
  statisticalCodes: [1, 4]
};

const typeMap = {
  DigiRes: 'Electronic',
  NotAAS: 'Not at AAS'
};

const elRelMap = {
  '0':'Resource',
  '1':'Version of resource',
  '2':'Related resource',
  '3':'No information provided',
  '8':'No display constant generated'
};

const illMap = {
  a: 'Will lend',
  b: 'Will not lend',
  c: 'Will lend hard copy only',
  l: 'Limited lending policy',
  u: 'Unknown lending policy'
}

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

const inotes = {
};

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
  if (!mfhdFile) { throw "Usage: node holdingsItems-aas.js <conf_file> <mfhd_jsonl_file>" }
  let confDir = path.dirname(confFile);
  let confData = fs.readFileSync(confFile, { encoding: 'utf8' });
  let conf = JSON.parse(confData);
  ns = conf.nameSpace;
  let holdingsStart = conf.holdingsStart;
  refDir = conf.refDir.replace(/^\./, confDir);
  let prefix = '';
  let hprefix = 'ho';
  let iprefix = 'it';
  let wdir = path.dirname(mfhdFile);
  let fn = path.basename(mfhdFile, '.jsonl');
  let outBase = wdir + '/' + fn;
  for (let f in files) {
    let p = (f === 'err') ? outBase + '-' + f + '.mrc' : (f === 'idmap') ? outBase + '.map' : outBase + '-' + f + '.jsonl';
    files[f] = p;
    if (fs.existsSync(p)) fs.unlinkSync(p);
    outs[f] = fs.createWriteStream(p)
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
  // throw(refData);

  // create tsv map
  let tsvDir = conf.tsvDir || conf.refDir;
  if (tsvDir) {
    let tsvFiles = fs.readdirSync(tsvDir);
    tsvFiles.forEach(f => {
      if (f.match(/\.tsv$/)) {
        let prop = f.replace(/\.tsv/, '');
        let cols = tsvCols[prop];
        tsvMap[prop] = {}
        let tpath = tsvDir + '/' + f;
        let dat = fs.readFileSync(tpath, { encoding: 'utf8' });
        dat.split(/\n/).forEach(l => {
          let c = l.split(/\t/);
          let k = c[cols[0]].trim();
          let v = c[cols[1]];
          v = v.trim();
          if (prop === 'statuses') {
            v = v.substring(0, 1) + v.substring(1).toLowerCase();
            v = (v.match(/Checked out|damaged|Aged|Paged/)) ? 'Available' : v;
          }
          tsvMap[prop][k] = (refData[prop]) ? refData[prop][v] : (prop === 'statuses') ? v : '';
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
      let k = c[0];
      let bid = k.substring(1);
      instMap[k] = { id: c[1], ea: c[5], blvl: c[4], type: c[6], bibId: bid };
    }
  }
  // throw(instMap);

  const items = {};
  const itemFile = wdir + '/items.csv';
  let csv = fs.readFileSync(itemFile, { encoding: 'utf8' });
  let rawItems = parse(csv, {
    columns: true,
    skip_empty_lines: true,
    bom: true
  });
  rawItems.forEach(r => {
    let mid = r.MFHD_ID;
    delete r.MFHD_ID;
    if (!items[mid]) items[mid] = [];
    items[mid].push(r);
  });
  // throw(items);

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
  const occ = {};

  const makeItems = (r, holdings, inst, leader) => {
    let ihrid = iprefix + r.Item_ID;
    if (ihrid) {
      let i = {
        _version: 1,
        id: uuid(ihrid, ns),
        hrid: ihrid,
        permanentLoanTypeId: refData.loantypes['Can circulate'],
        holdingsRecordId: holdings.id,
        status: { name: 'Available' }
      }
      let mt = r.MatType;
      i.materialTypeId = tsvMap.mtypes[mt];
      let lt = r.PermLoan;
      i.permanentLoanTypeId = refData.loantypes[lt];
      if (r.Status === 'Missing') i.status.name = 'Missing';
      if (r.Volume) i.volume = r.Volume;
      if (r.Copy) i.copyNumber = r.Copy;
      let bc = r.Barcode;
      if (bc && !bcseen[bc]) {
        i.barcode = bc;
        bcseen[bc] = i.hrid;
      } else if (bc) {
        console.log(`WARN barcode "${bc}" already used by ${i.hrid}`);
      }

      if (i.materialTypeId) {
        if (i.permanentLoanTypeId) {
          writeOut(outs.items, i);
          ttl.items++;
          let hid = holdings.hrid.substring(2);
          holdItemMap[hid] = i.id;
        } else {
          console.log(`ERROR item loantype not found for "Can circulate"`);
          ttl.itemErr++;
        }
      } else {
        console.log(`ERROR item material type not found for "" (${i.hrid})`);
        ttl.itemErr++;
      }
    }
  }

  const hseen = {};
  const bwseen = {};
  const relMap = {};
  const holdItemMap = {};

  let fileStream = fs.createReadStream(mfhdFile);
  let rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });
  for await (let line of rl) {
    ttl.count++;
    let m = JSON.parse(line);
    let ctrl = (m['001']) ? m['001'][0] : '';
    let f004 = (m['004']) ? m['004'][0] : '';
    let bhrid = prefix + f004;
    let mh = {};
    let iid = '';
    if (m['852']) {
      m['852'].forEach(f => {
        f.subfields.forEach(s => {
          let k = Object.keys(s)[0];
          if (!mh[k]) mh[k] = [];
          mh[k].push(s[k]);
        });
      });
      mh.ind1 = m['852'][0].ind1;
      mh.ind2 = m['852'][0].ind2;
    }
    if (mh.i) { 
      mh.i = mh.i.join(' ');
    } 
    let loc = (mh.b) ? mh.b[0] : '';
    let cpn = (mh.t) ? mh.t[0] : '';
    let cn = (mh.i) ? mh.h[0] + ' ' + mh.i : mh.h[0] || '';
    if (cn.match(/No call number/)) cn = '';
    let tcodeStr = typeMap[loc] || 'Physical';
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
      h.permanentLocationId = tsvMap.locations[loc] || '';
      if (cn) {
        h.callNumber = cn;
        h.callNumberTypeId = cnTypeMap[mh.ind1] || cnTypeMap['8'];
      }
      if (mh.k) h.callNumberPrefix = mh.k[0];
      if (cpn) h.copyNumber = cpn;

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
            } else if (s.z) {
              o.linkText = s.z;
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
          } else if (s.z) {
            o.note = s.z;
          } else if (s.x) {
            o.staffNote = s.x;
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
          } else if (s.z) {
            o.note = s.z;
          } else if (s.x) {
            o.staffNote = s.x;
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
          } else if (s.z) {
            o.note = s.z;
          } else if (s.x) {
            o.staffNote = s.x;
          }
        });
        h.holdingsStatementsForIndexes.push(o);
      });

      let lchar = (m['008'] && m['008'][0]) ? m['008'][0].substring(20, 21) : 'u';
      let lstr = illMap[lchar];
      h.illPolicyId = refData.illPolicies['Will not lend'];
      
      if (h.permanentLocationId) {
        if (!hseen[ctrl]) {
          ttl.holdings++;
          writeOut(outs.holdings, h);
          hseen[ctrl] = h.id;

          let lnk = m['014'];
          if (lnk) {
            lnk.forEach(l => {
              l.subfields.forEach(s => {
                if (s.a) {
                  let bhrid = prefix + s.a;
                  let inst = instMap[bhrid];
                  if (inst) {
                    let bwh = JSON.parse(JSON.stringify(h));
                    bwh.instanceId = inst.id;
                    holdingsStart++;
                    bwh.hrid = holdingsStart.toString();
                    bwh.id = uuid(bwh.hrid, ns);
                    delete bwh.formerIds;
                    let ro = {
                      superInstanceId: h.instanceId,
                      subInstanceId: inst.id,
                      instanceRelationshipTypeId: refData.instanceRelationshipTypes['bound-with']
                    };
                    ro.id = uuid(ro.superInstanceId + ro.subInstanceId, ns);
                    writeOut(outs.rel, ro);
                    ttl.relationships++;

                    writeOut(outs.holdings, bwh);
                    ttl.holdings++;

                    bwh.hlink = ctrl;
                    if (!relMap[inst.bibId]) relMap[inst.bibId] = [];
                    relMap[inst.bibId].push(bwh);
                  }
                }
              });
            });
            bwseen[h.id] = 1;
            h.hlink = ctrl;
            if (!relMap[inst.bibId]) relMap[inst.bibId] = [];
            relMap[inst.bibId].push(h);
          }

          let itemRecs = items[ctrl];
          if (itemRecs) {
            itemRecs.forEach(item => {
              makeItems(item, h, inst, m.leader);
            });
          } else {
            // console.log(ctrl);
          }

        } else {
          console.log(`ERROR hrid ${hhrid} already used!`);
          ttl.holdingsErr++;
        }
      } else {
        console.log(`ERROR location not found for "${loc}" (${hhrid})`);
        ttl.holdingsErr++;
      }
      if (dbug.match(/h/)) console.log(h);
    } else {
      console.log(`ERROR instance "${bhrid}" not found for ${hhrid}`);
      ttl.holdingsErr++;
    }
  }

  let occur = {};
  let bwhseen = {};
  let bwpseen = {};

  // console.log(relMap);
  // console.log(holdItemMap);
  for (let bid in relMap) {
    relMap[bid].forEach(h => {
      let hid = h.id;
      let hctrl = h.hlink;
      let iid = holdItemMap[hctrl]
      let bwpKey = hid + iid;
      if (hid && iid && !bwpseen[bwpKey]) {
        let o = {
          id: uuid(bwpKey, ns),
          holdingsRecordId: hid,
          itemId: iid
        }
        // console.log(bid, hid, iid);
        writeOut(outs.bwp, o);
        ttl.boundwiths++;
        bwpseen[bwpKey] = 1;
      } else {
       console.log(bid, hid, iid);
      }
    });
  }

  showStats();

} catch (e) {
  console.log(e);
}