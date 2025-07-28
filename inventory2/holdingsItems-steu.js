import fs from 'fs';
import path from 'path';
import { v5 as uuid } from 'uuid';
import readline from 'readline';

let confFile = process.argv[2];

let refDir;
let mfhdFile = process.argv[3];
let ns;
const refData = {};
const tsvMap = {};
const suppMap = {};
const outs = {};
const dbug = process.env.DEBUG;

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

const noteTags = [ '500', '590' ];

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
  if (!mfhdFile) { throw "Usage: node holdingsItems-steu.js <conf_file> <mfhd_jsonl_file>" }
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
          if (prop.match(/(mtypes|holdingsTypes)/)) k = k.replace(/^.+ = /, '');
          if (prop === 'statuses') {
            let v = c[2].trim().toLowerCase();
            let fl = v.substring(0, 1);
            fl = fl.toUpperCase();
            v = v.replace(/^./, fl);
            if (!v || v.match(/Checked out|Paged|Aged to lost/)) v = 'Available';
            tsvMap[prop][k] = v;
          } else {
            let v = (prop === 'locations') ? c[2].trim() : c[1].trim();
            v = v.trim();
            if (refData[prop] && k && v) tsvMap[prop][k] = refData[prop][v];
          }
        });
      }
    });
  }
  // throw(tsvMap.loantypes);
  
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
      instMap[k] = { id: c[1], blvl: c[4], type: c[6] };
      if (c[5]) {
        instMap[k].ea = JSON.parse(c[5]);
      }
      if (c[7]) {
        instMap[k].af = JSON.parse(c[7]);
      }
    }
  }
  // throw(instMap);

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
  const hseen = {};
  const bwseen = {};
  const bcHoldMap = {};
  const occ = {};

  const makeBoundWiths = (iid, holdings, barcode) => {
    if (iid && !bwseen[holdings.id]) {
      let o = {
        itemId: iid,
        holdingsRecordId: holdings.id
      };
      o.id = uuid(o.holdingsRecordId, o.itemId);
      writeOut(outs.bwp, o);
      bwseen[holdings.id] = 1;
      ttl.boundwiths++
    }
    let supId = (bcHoldMap[barcode]) ? bcHoldMap[barcode].instanceId : '';
    let subId = holdings.instanceId;
    if (supId && subId && supId !== subId) {
      let ro = {
        superInstanceId: supId,
        subInstanceId: subId,
        instanceRelationshipTypeId: refData.instanceRelationshipTypes['bound-with']
      };
      ro.id = uuid(ro.superInstanceId + ro.subInstanceId, ns);
      writeOut(outs.rel, ro);
      ttl.relationships++;
    }
  }

  const makeItems = (fields, holdings, inst, mh, f866) => {
    let f336 = (inst && inst.af && inst.af['336'] && inst.af['336'][0].subfields) ? inst.af['336'][0].subfields : [];
    let mt = '';
    f336.forEach(s => {
      if (s.a) mt = s.a;
    });
    let loc = mh.c;

    fields.forEach(r => {
      let bc = '';
      let v = '';
      r.subfields.forEach(s => {
        if (s.p) bc = s.p;
        if (s['3']) v = s['3'];
      })
      let iid = holdings.hrid.replace(/^[a-z]+/, iprefix);
      if (occ[iid] === undefined) {
        occ[iid] = 0;
      } else {
        occ[iid]++;
      }
      let occStr = occ[iid].toString().padStart(3, 0);
      let ihrid = iid + '-' + occStr;
      let i = {
        _version: 1,
        id: uuid(ihrid, ns),
        hrid: ihrid,
        permanentLoanTypeId: refData.loantypes['Can circulate'],
        holdingsRecordId: holdings.id,
        status: { name: 'Available' }
      }
      if (bc) {
        if (!bcseen[bc]) {
          i.barcode = bc;
          bcseen[bc] = i.hrid;
        } else {
          console.log(`WARN barcode "${bc}" already used by ${i.hrid}`);
        }
      }
      if (mh.t) {
        i.copyNumber = mh.t;
      }

      if (mh.m) i.itemLevelCallNumberSuffix = mh.m;
      if (mh.z) {
        i.notes = [];
        mh.z.forEach(n => {
          let t = refData.itemNoteTypes.Note;
          let o = makeItemNote(n, t, true);
          i.notes.push(o);
        });
      }
      i.materialTypeId = tsvMap.mtypes[mt] || refData.mtypes.Unspecified;
      i.permanentLoanTypeId = tsvMap.loantypes[loc] || refData.loantypes['Standard'];
      if (v) {
        i.volume = v;
      }
      // console.log(i);
      if (i.materialTypeId) {
        if (i.permanentLoanTypeId) {
          writeOut(outs.items, i);
          ttl.items++;
        } else {
          console.log(`ERROR item loantype not found for "${loc}"`);
          ttl.itemErr++;
        }
      } else {
        console.log(`ERROR item material type not found for "${mt}" (${i.hrid})`);
        ttl.itemErr++;
      }
    });
  }

  

  let fileStream = fs.createReadStream(mfhdFile);
  let rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });
  for await (let line of rl) {
    ttl.count++;
    let m = JSON.parse(line);
    if (dbug) console.log(m);
    let ctrl = (m['001']) ? m['001'][0] : '';
    let bhrid = (m['004']) ? m['004'][0] : '';
    let mh = {};
    let iid = '';
    if (m['852']) {
      m['852'].forEach(f => {
        f.subfields.forEach(s => {
          let k = Object.keys(s)[0];
          if (k === 'z') {
            if (!mh[k]) mh[k] = [];
            mh[k].push(s[k]);
          } else {
            mh[k] = s[k];
          }
        });
      });
      mh.ind1 = m['852'][0].ind1;
      mh.ind2 = m['852'][0].ind2;
    }
    
    let loc = mh.c;
    let cn = (mh.i) ? mh.h + ' ' + mh.i : mh.h || '';
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
        discoverySuppress: false
      }
      h.instanceId = inst.id;
      if (inst.af && inst.af['338']) {
        let tstr;
        inst.af['338'][0].subfields.forEach(s => {
          if (s.a) {
            tstr = s.a
          }
        });
        if (tstr === 'object') h.discoverySuppress = true;
        h.holdingsTypeId = tsvMap.holdingsTypes[tstr] || refData.holdingsTypes.Physical;
      }
      h.permanentLocationId = tsvMap.locations[loc] || refData.locations.UNMAPPED || '';
      if (cn) {
        h.callNumber = cn;
        h.callNumberTypeId = cnTypeMap[mh.ind1] || cnTypeMap['8'];
      }

      if (inst.ea) {
        h.electronicAccess = inst.ea;
      }

      let nts = [];
      noteTags.forEach(t =>{
        if (m[t]) {
          m[t].forEach(f => {
            f.subfields.forEach(s => {
              if (s.a) nts.push(s.a);
            });
          });
        }
      });
      if (nts[0]) h.administrativeNotes = nts;

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
      
      if (h.permanentLocationId) {
        if (!hseen[ctrl]) {
          ttl.holdings++;
          writeOut(outs.holdings, h);
          hseen[ctrl] = h.id;

          if (m['876']) {
            makeItems(m['876'], h, inst, mh, m['866']);
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

  showStats();

} catch (e) {
  console.log(e);
}