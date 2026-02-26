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

const tsvCols = {
  locations: [0, 11],
  mtypes: [0, 9],
  statuses: [1, 4],
  statisticalCodes: [1, 4]
};

const typeMap = {
  u: 'Physical',
  v: 'Multi-part monograph',
  x: 'Monograph',
  y: 'Serial'
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
  q: "Voyager Note",
  f: "Voyager Historical Charges",
  z: "Voyager Create Date",
  m: "Voyager Modify Date",
  e: "Voyager Create Operator",
  p: "Voyager Modify Operator"
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
  if (!mfhdFile) { throw "Usage: node holdingsItems-ba.js <conf_file> <mfhd_jsonl_file>" }
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
      let bid = k.substring(2);
      instMap[k] = { id: c[1], ea: c[5], blvl: c[4], type: c[6], bibId: bid };
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
  const instItemMap = {};

  const makeItems = (fields, holdings, inst, leader) => {
    let htype =  leader.substring(6, 7);
    fields.forEach(r => {
      let ih = {};
      r.subfields.forEach(s => {
        let code = Object.keys(s)[0]
        if (code.match(/[jqfzmep_]/)) {
          if (!ih[code]) ih[code] = [];
          ih[code].push(s[code]);
        } else {
          ih[code] = s[code];
        }
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
        circulationNotes: [],
        statisticalCodeIds: []
      }
      let stat = tsvMap.statuses[ih.s] || '';
      let statDate = '';
      if (stat) {
        i.status.name = stat;
        if (ih.v) {
          try {
            let sd = new Date(ih.v).toISOString();
            sd = sd.replace(/T00:/, 'T12:');
            i.status.date = sd;
            statDate = sd;
          } catch (e) {
            console.log(`WARN "${ih.v}" is not a valid status date`);
            bwFlag = true;
          }
        }
      }
      if (ih.s && ih.s.match(/Damaged/i)) {
        i.itemDamagedStatusId = refData.itemDamageStatuses.Damaged;
        if (statDate) i.itemDamagedStatusDate = statDate;
      }
      
      let mt = tsvMap.mtypes[ih.t];
      i.materialTypeId = mt;

      if (ih.j) {
        ih.j.forEach(d => {
          let sid = tsvMap.statisticalCodes[d];
          if (sid) {
            i.statisticalCodeIds.push(sid);
          } else {
            console.log(`WARN FOLIO statistical code not found for "${d}" (${i.hrid})`);
          }
        });
      }

      let permLocId = tsvMap.locations[ih.l];
      if (permLocId !== holdings.permanentLocationId) {
        i.permanentLocationId = permLocId;
      }
      if (ih.h) {
        let tempId = tsvMap.locations[ih.h];
        if (tempId !== permLocId) {
          i.temporaryLocationId = tempId;
        }
      }
      if (ih.g) i.copyNumber = ih.g;
      if (ih.a) {
        let cn = (ih.b) ? ih.a + ' ' + ih.b : ih.a;
        if (cn !== holdings.callNumber) {
          i.itemLevelCallNumber = cn;
          i.itemLevelCallNumberTypeId = refData.callNumberTypes['Other scheme'];
        }
      }
      if (ih.x && ih.x !== holdings.callNumberPrefix) i.itemLevelCallNumberPrefix = ih.x;
      if (ih.y && ih.y !== holdings.callNumberSuffix) i.itemLevelCallNumberSuffix = ih.y;
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
      if (ih.d) {
        i.yearCaption = [];
        if (ih.d) i.yearCaption.push(ih.d);
      }
      let desc = [];
      if (ih.n) desc.push(ih.n);
      if (ih.o) desc.push(ih.o);
      if (desc[0]) i.descriptionOfPieces = desc.join('; ');
      for (let k in inotes) {
        if (ih[k]) {
          let tstr = inotes[k];
          let t = refData.itemNoteTypes[tstr];
          if (t) {
            ih[k].forEach(d => {
              let o = makeItemNote(d, t, true);
              i.notes.push(o);
            });
          }
        }
      }
      if (ih.q) {
        i.circulationNotes = [];
        let t = (ih.r && ih.r.match(/discharge/)) ? 'Check in' : 'Check out';
        ih.q.forEach(d => {
          let o = {
            note: d,
            noteType: t,
            date: new Date().toISOString().replace(/T.+/, ''),
            id: uuid(iid + t + d, ns)
          };
          i.circulationNotes.push(o);
        });
      }
      
      if (i.materialTypeId) {
        if (i.permanentLoanTypeId) {
          writeOut(outs.items, i);
          ttl.items++;
          if (ih._) {
            ih._.forEach(_ => {
              if (!instItemMap[_]) instItemMap[_] = [];
              instItemMap[_].push({ iid: i.id, hid: holdings.id });
            });
          }
        } else {
          console.log(`ERROR item loantype not found for "Can circulate"`);
          ttl.itemErr++;
        }
      } else {
        console.log(`ERROR item material type not found for "${ih.t}" (${i.hrid})`);
        ttl.itemErr++;
      }
    });
  }

  const hseen = {};
  const bwseen = {};
  const relMap = {};

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
    bhrid = prefix + bhrid;
    let mh = {};
    let iid = '';
    if (m['852']) {
      m['852'].forEach(f => {
        f.subfields.forEach(s => {
          let k = Object.keys(s)[0];
          if (k.match(/[zxi]/)) {
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
    if (mh.i) { 
      mh.i = mh.i.join(' ');
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
      }
      if (mh.m) h.callNumberSuffix = mh.m;
      if (mh.k) h.callNumberPrefix = mh.k;
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

      let lchar = (m['008'] && m['008'][0]) ? m['008'][0].substring(20, 21) : 'u';
      let lstr = illMap[lchar];
      h.illPolicyId = refData.illPolicies[lstr];

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
            lnk.forEach(l => {
              l.subfields.forEach(s => {
                if (s.a) {
                  let bhrid = prefix + s.a;
                  let inst = instMap[bhrid];
                  if (inst) {
                    let bwh = JSON.parse(JSON.stringify(h));
                    bwh.instanceId = inst.id;
                    // delete bwh.notes;
                    // delete bwh.holdingsStatements;
                    // delete bwh.holdingsStatementsForSupplements;
                    // delete bwh.holdingsStatementsForIndexes;
                    relMap[inst.bibId] = bwh;
                    let ro = {
                      superInstanceId: h.instanceId,
                      subInstanceId: inst.id,
                      instanceRelationshipTypeId: refData.instanceRelationshipTypes['bound-with']
                    };
                    ro.id = uuid(ro.superInstanceId + ro.subInstanceId, ns);
                    writeOut(outs.rel, ro);
                    ttl.relationships++;
                  }
                }
              });
            });
            bwseen[h.id] = 1;
          }

          let f14 = m['014'];
          let subz = [];
          if (f14) {
            f14.forEach(f => {
              f.subfields.forEach(s => {
                if (s.a) subz.push({ _: s.a })
              });
            });
          }
          if (subz[0]) {
            subz.push({ _: inst.bibId});
            if (m['949']) {
              let dum = JSON.parse(JSON.stringify(m['949'][0]));
              let subs = [];
              dum.subfields.forEach(s => {
                if (s.t || s.s) subs.push(s);
              });
              if (subs[0]) dum.subfields = [...subs, ...subz];
              if (!m['949']) m['949'] = [];
              m['949'].unshift(dum);
              // console.log(JSON.stringify(m['949'], null, 2));
            }
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

  /*
    This is the item creation section
  */
  
  
  let items = {};
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
        } else {
          console.log(`ERROR loantype not found for ${iid}`);
          ttl.itemErr++;
        }
      } else {
        console.log(`ERROR material type "${vtype}" not found for ${iid}`);
        ttl.itemErr++;
      }
      ttl.items++;
    }
  }

  let occur = {};
  let bwhseen = {};
  let bwpseen = {};

  // console.log(instItemMap);
  // console.log(relMap);
  for (let bid in instItemMap) {
    instItemMap[bid].forEach(info => {
      let iid = info.iid;
      let hid;
      if (relMap[bid] && !bwhseen[bid]) {
        let bwh = JSON.parse(JSON.stringify(relMap[bid]));
        let hrid = bwh.hrid;
        if (occur[hrid]) {
          occur[hrid]++;
        } else {
          occur[hrid] = 1;
        }
        let occ = occur[hrid];
        bwh.hrid = `${bwh.hrid}.${occ}`;
        bwh.id = uuid(bwh.hrid, ns);
        writeOut(outs.holdings, bwh);
        ttl.holdings++;
        hid = bwh.id;
        bwhseen[bid] = hid;
      } else {
        hid = bwhseen[bid];
      }
      let o = {
        itemId: iid,
        holdingsRecordId: hid || info.hid,
      };                
      o.id = uuid(o.holdingsRecordId + o.itemId, ns);
      if (!bwpseen[o.id]) {
        writeOut(outs.bwp, o);
        ttl.boundwiths++;
        bwpseen[o.id] = 1;
      }
    });
  }

  showStats();

} catch (e) {
  console.log(e);
}