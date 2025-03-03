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
  if (!mfhdFile) { throw "Usage: node holdingsItems-lesley.js <conf_file> <mfhd_jsonl_file>" }
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
          if (prop === 'statuses') {
            let v = c[3].trim().toLowerCase();
            let fl = v.substring(0, 1);
            fl = fl.toUpperCase();
            v = v.replace(/^./, fl);
            if (!v || v.match(/Checked out|Paged|Aged to lost/)) v = 'Available';
            tsvMap[prop][k] = v;
          } else {
            let v = (prop === 'mtypes') ? c[8] : c[11];
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
    let mfn = fn.replace(/^(.+)-.+/, wdir + '/$1.map');
    let fileStream = fs.createReadStream(mfn);
    let rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });
    for await (let line of rl) {
      let c = line.split(/\|/);
      let k = c[0].substring(1);
      instMap[k] = { id: c[1], ea: c[5], blvl: c[4], type: c[6] };
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
  const occ = {};
  const makeItems = (fields, holdings, inst, leader) => {
    let htype =  leader.substring(6, 7);
    fields.forEach(r => {
      let ih = {};
      r.subfields.forEach(s => {
        let code = Object.keys(s)[0]
        ih[code] = s[code];
      });
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
        status: { name: 'Available' },
        notes: [],
        circulationNotes: []
      }
      let stat = tsvMap.statuses[ih.s] || '';
      if (stat) {
        i.status.name = stat;
        if (ih.v) {
          try {
            let sd = new Date(ih.v).toISOString();
            sd = sd.replace(/T00:/, 'T12:');
            i.status.date = sd;
          } catch (e) {
            console.log(`WARN "${ih.v}" is not a valid status date`)
          }
        }
      }
      if (ih.s === 'Damaged') {
        i.itemDamagedStatusId = refData.itemDamageStatuses.Damaged;
      }
      if (ih.s.match(/Review/)) {
        let note = ih.s
        let t = ['Check in', 'Check out'];
        t.forEach(y => {
          let o = {
            note: note,
            noteType: y, 
            date: new Date().toISOString().replace(/T.+/, ''),
            id: uuid(iid + note + y, ns)
          };
          i.circulationNotes.push(o);
        });
      }
      let mt = tsvMap.mtypes[ih.t];
      i.materialTypeId = mt;
      if (ih.h) {
        let tempId = tsvMap.locations[ih.h];
        if (tempId !== holdings.permanentLocationId) {
          i.temporaryLocationId = tempId;
        }
      }
      if (ih.g) i.copyNumber = ih.g;
      if (ih.a) {
        let cn = (ih.b) ? ih.a + ' ' + ih.b : ih.a;
        if (cn !== holdings.callNumber) {
          i.itemLevelCallNumber = cn;
          i.itemLevelCallNumberTypeId = refData.callNumberTypes['Other scheme'];
          if (ih.x) i.itemLevelCallNumberPrefix = ih.x;
        }
      }
      if (ih.i && !bcseen[ih.i]) {
        i.barcode = ih.i;
        bcseen[ih.i] = i.id;
      } else if (ih.i) {
        console.log(`WARN duplicate barcode found ${ih.i} (${i.hrid})`);
      }
      if (ih.c) {
        if (htype === 'y') {
          i.enumeration = ih.c;
        } else {
          i.volume = ih.c;
        }
      }
      if (ih.k) i.chronology = ih.k;
      if (ih.d || ih.o) {
        i.yearCaption = [];
        if (ih.d) i.yearCaption.push(ih.d);
        // if (ih.o) i.yearCaption.push(ih.o);
      }
      if (ih.m) i.numberOfPieces = ih.m;
      if (ih.n) i.descriptionOfPieces = ih.n;
      if (ih.q) {
        let t = refData.itemNoteTypes.General;
        if (t) {
          let o = makeItemNote(ih.q, t, true);
          i.notes.push(o);
        }
      }
      if (ih.f) {
        let t = refData.itemNoteTypes['Voyager Historical Charges'];
        if (t) {
          let o = makeItemNote(ih.f, t, true);
          i.notes.push(o);
        }
      }
      if (ih.e) {
        let t = refData.itemNoteTypes['Voyager Historical Browses'];
        if (t) {
          let o = makeItemNote(ih.e, t, true);
          i.notes.push(o);
        }
      }
      if (ih.r || ih.u) i.circulationNotes = [];
      if (ih.r) {
        let o = {
          note: ih.r,
          noteType: 'Check in',
          date: new Date().toISOString().replace(/T.+/, ''),
          id: uuid(iid + 'in', ns)
        };
        i.circulationNotes.push(o);
      }
      if (ih.u) {
        let o = {
          note: ih.u,
          noteType: 'Check out',
          date: new Date().toISOString().replace(/T.+/, ''),
          id: uuid(iid + 'out', ns)
        };
        i.circulationNotes.push(o);
      }
      if (i.materialTypeId) {
        if (i.permanentLoanTypeId) {
          writeOut(outs.items, i);
          ttl.items++;
        } else {
          console.log(`ERROR item loantype not found for "Can circulate"`);
          ttl.itemErr++;
        }
      } else {
        console.log(`ERROR item material type not found for "${ih.t}"`);
        ttl.itemErr++;
      }
    });
  }

  const hseen = {};
  const bwseen = {};

  let fileStream = fs.createReadStream(mfhdFile);
  let rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });
  for await (let line of rl) {
    ttl.count++;
    let m = JSON.parse(line);

    let ctrl = (m['001']) ? m['001'][0] : '';
    let bhrid = (m['004']) ? m['004'][0] : '';
    let mh = {};
    let iid = '';
    if (m['852']) {
      m['852'].forEach(f => {
        f.subfields.forEach(s => {
          let k = Object.keys(s)[0];
          if (k.match(/[zx]/)) {
            if (!mh[k]) mh[k] = [];
            mh[k].push(s[k]);
          }
          else {
            mh[k] = s[k]; 
          }
        });
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
        if (mh.k) h.callNumberPrefix = mh.k;
        if (mh.m) h.callNumberSuffix = mh.m;
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
      
      if (m['908']) {
        m['908'][0].subfields.forEach(s => {
          if (s.x && s.x === 'Y') {
            h.discoverySuppress = true;
          }
        });
      }

      if (h.permanentLocationId) {
        if (!hseen[ctrl]) {
          ttl.holdings++;
          writeOut(outs.holdings, h);
          hseen[ctrl] = h.id;
          let lnk = m['014'];
          if (lnk) {
            for (let x = 0; x < lnk.length; x++) {
              let sa = lnk[x].subfields[0].a;
              if (!sa.match(/^\d+$/)) {
                lnk.splice(x, 1);
                x--;
              }
            }
            if (iid && lnk[0]) {
              let o = {
                itemId: uuid(iid, ns),
                holdingsRecordId: h.id
              };
              o.id = uuid(o.holdingsRecordId, o.itemId);
              writeOut(outs.bwp, o);
              ttl.boundwiths++
            }
            let occ = 0;
            lnk.forEach(l => {
              occ++;
              l.subfields.forEach(s => {
                if (s.a) {
                  let iid = bibItemMap[s.a];
                  if (iid) {
                    let hstr = JSON.stringify(h);
                    let bwh = JSON.parse(hstr);
                    bwh.instanceId = instMap[s.a];
                    bwh.hrid = `${bwh.hrid}.${occ}`;
                    bwh.id = uuid(bwh.hrid, ns);
                    let o = {
                      itemId: uuid(iid, ns),
                      holdingsRecordId: bwh.id,
                    };                
                    o.id = uuid(o.holdingsRecordId, o.itemId);
                    let ro = {
                      superInstanceId: h.instanceId,
                      subInstanceId: bwh.instanceId,
                      instanceRelationshipTypeId: refData.instanceRelationshipTypes['bound-with']
                    };
                    ro.id = uuid(ro.superInstanceId + ro.subInstanceId, ns);
                    writeOut(outs.bwp, o);
                    writeOut(outs.holdings, bwh);
                    writeOut(outs.rel, ro);
                    ttl.boundwiths++;
                    ttl.relationships++;
                  }
                }
              });
            });
            bwseen[h.id] = 1;
          }
          if (m['949']) {
            makeItems(m['949'], h, inst, m.leader);
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