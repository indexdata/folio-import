const fs = require('fs');
const readline = require('readline');
const uuid = require('uuid/v5');
const path = require('path');

let refDir = process.argv[2];
let mapFile = process.argv[3];
let mainDir = process.argv[4];
let etcDir = '../etc/pma';

const ns = '89ff2bcb-b0d2-4ccc-a6e8-cb9b5ca3000e';

const inFiles = {
  items: 'z30.seqaa',
  links: 'z103.seqaa',
  loans: 'z36.seqaa'
}
if (process.env.TEST) inFiles.items = 'test.seqaa';

const files = {
  holdings: 'holdings.jsonl',
  items: 'items.jsonl',
  rel: 'relationships.jsonl',
  bwp: 'bound-with-parts.jsonl'
};

const rfiles = {
  locations: 'locations.json',
  mtypes: 'material-types.json',
  holdingsRecordsSources: 'holdings-sources.json',
  holdingsTypes: 'holdings-types.json',
  callNumberTypes: 'call-number-types.json',
  loantypes: 'loan-types.json',
  itemNoteTypes: 'item-note-types.json',
  holdingsNoteTypes: 'holdings-note-types'
};

const tfiles = {
  mtypes: 'mtypes.tsv',
  statuses: 'statuses.tsv'
};

const ffiles = {
  items: 'z30-fields.txt',
  links: 'z103-fields.txt',
  loans: 'z36-fields.txt'
}

const htypes = {
  m: 'Monograph',
  a: 'Multi-part monograph',
  b: 'Serial',
  s: 'Serial'
}

const relType = '758f13db-ffb4-440e-bb10-8a364aa6cb4a';  // bound-with

const fieldMap = (fmap, record) => {
  let f = {};
  for (let k in fmap) {
    let v = fmap[k];
    let d = record.substring(v[0], v[1]).trim();
    f[k] = d;
  }
  return f;
}

const writeJSON = (fn, data) => {
  const out = JSON.stringify(data) + "\n";
  fs.writeFileSync(fn, out, { flag: 'a' });
}

const noteGen = (note, type, staffOnly) => {
  let out = {
    note: note,
    itemNoteTypeId: type
  }
  out.staffOnly = (staffOnly) ? true : false;
  return out;
}

try {
  if (!mainDir) {
    throw new Error('Usage: $ node items-pma2.js <ref_dir> <inst_map> <items_dir>');
  }
  if (!fs.existsSync(mainDir)) {
    throw new Error('Can\'t find input file');
  }

  let begin = new Date().valueOf();
  let nowDate = new Date().toISOString().replace(/T.+/, '');

  mainDir = mainDir.replace(/\/$/, '');
  refDir = refDir.replace(/\/$/, '');

  for (let f in files) {
    let fullPath = mainDir + '/' + files[f];
    if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
    files[f] = fullPath;
  }
  // console.log(files); return;

  let refData = {};
  for (let prop in rfiles) {
    let rpath = refDir + '/' + rfiles[prop];
    let refObj = require(rpath);
    let arr = refObj[prop];
    refData[prop] = {}
    arr.forEach(e => {
      let key = (prop === 'locations') ? e.code : e.name;
      let id = e.id;
      refData[prop][key] = id;
    });
  }
  // console.log(refData); return;

  const fmap = {};

  for (let ff in ffiles) {
    let file = etcDir + '/' + ffiles[ff];
    console.log(`Reading ${file}`);
    let fields = fs.readFileSync(file, { encoding: 'utf8' });
    let cstart = 0;
    fmap[ff] = {};
    fields.split(/\n/).forEach(f => {
      let d = f.match(/^.+?-(.+) PICTURE.*\((\d+).+/);
      if (d) {
        let k = d[1];
        let v = d[2]
        v = parseInt(v, 10);
        k = k.replace(/\W/g, '_');
        let cend = cstart + v;
        fmap[ff][k] = [ cstart, cend, v ];
        cstart = cend;
      }
    });
  }
  // console.log(fmap); return;

  const tmap = {};
  for (let prop in tfiles) {
    let tpath = refDir + '/' + tfiles[prop];
    let tdata = fs.readFileSync(tpath, { encoding: 'utf8'});
    let arr = tdata.split(/\n/);
    arr.shift();
    tmap[prop] = {}
    arr.forEach(e => {
      let c = e.split(/\t/);
      let key = c[0];
      let val = c[1] || 'unspecified';
      if (key) tmap[prop][key] = (refData[prop]) ? refData[prop][val] : val;
      if (prop === 'statuses' && key) {
        if (!tmap.loantypes) tmap.loantypes = {};
        tmap.loantypes[key] = refData.loantypes[c[2]];
      }
    });
  }
  // console.log(tmap); return;

  const lmap = {};
  const lsmap = {};
  const loanMap = {};
  const hseen = {};
  const iseen = {};
  const bcused = {};
  const rseen = {};

  const main = () => {
    let mainFile = mainDir + '/' + inFiles.items;
    let fileStream = fs.createReadStream(mainFile);
    let rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });

    let total = 0;
    let irc = 0;
    let hrc = 0;
    let rlc = 0;
    let bwc = 0;
    let ezSeq = 0;
    rl.on('line', r => {
      total++;
      let j = fieldMap(fmap.items, r);
      let doMake = true;
      // console.log(j);
      let bid = (j.DOC_NUMBER.match(/^0009/)) ? '000999999' : j.DOC_NUMBER;
      let seq = j.ITEM_SEQUENCE.replace(/^00(.+).$/, '$1');
      let loanKey = '';
      if (bid === '000999999') {
        loanKey = j.DOC_NUMBER + '-' + seq;
        if (!loanMap[loanKey]) doMake = false;
      }
      let inst = instMap[bid];
      if (inst && doMake) {
        let iid = (bid === '000999999') ? loanKey : bid + '-' + seq;
        let coll = j.COLLECTION;
        let locId = refData.locations[coll];
        let cn = j.CALL_NO;
        let cnType = j.CALL_NO_TYPE;
        let cnTypeId = (cnType === '0') ? refData.callNumberTypes['Library of Congress classification'] : refData.callNumberTypes['Other scheme'];
        let htype = inst.mtype;
        let mtype = j.MATERIAL;
        let status = j.ITEM_STATUS;
        let bc = j.BARCODE;
        let vol = j.DESCRIPTION;
        let staffNote = j.NOTE_INTERNAL;
        let pubNote = j.NOTE_OPAC;
        let circNote = j.NOTE_CIRCULATION;
        let ips = j.ITEM_PROCESS_STATUS || '';
        let link = lmap[bid];
        // console.log(link);
        let supIn = (link) ? link.id : '';
        let subIn = (supIn && instMap[bid]) ? instMap[bid].id : '';
        if (supIn && subIn) {
          let rel = {
            superInstanceId: supIn,
            subInstanceId: subIn,
            instanceRelationshipTypeId: relType
          }
          rel.id = uuid(supIn + subIn, ns);
          if (!rseen[rel.id]) {
            writeJSON(files.rel, rel);
            rseen[rel.id] = 1;
            rlc++;
          }
        }
        if (cn) cn = cn.replace(/\$\$./g, ' ').trim();
        let hid = bid + '-' + coll;
        if (!hseen[hid]) {
          let hr = {
            _version: '1',
            id: uuid(hid, ns),
            hrid: hid,
            instanceId: inst.id,
          };
          if (locId) {
            hr.permanentLocationId = locId;
          } else {
            console.log(`WARN [${bid} ${seq}] no location found for:`, coll);
            let nt = refData.holdingsNoteTypes.Note;
            let n = noteGen(`Aleph location code: ${coll}`, nt, 1);
            hr.notes = [n];
            hr.permanentLocationId = refData.locations.UNMAPPED;
          }
          hr.sourceId = refData.holdingsRecordsSources['FOLIO'];
          hr.callNumber = cn;
          hr.callNumberTypeId = cnTypeId;
          let htypeName = htypes[htype] || 'Physical';
          hr.holdingsTypeId = refData.holdingsTypes[htypeName];
          hrc++;
          // writeJSON(files.holdings, hr);
          hseen[hid] = hr;
        }
        if (!iseen[iid]) {
          if (hseen[hid]) {
            let notes = [];
            let ir = {
              _version: '1',
              id: uuid(iid, ns),
              hrid: iid,
              holdingsRecordId: hseen[hid].id
            };
            ir.materialTypeId = tmap.mtypes[mtype] || refData.mtypes['unspecified'];
            ir.permanentLoanTypeId = tmap.loantypes[status] || refData.loantypes['Can circulate'];
            if (cn && !hseen[hid].callNumber) {
              hseen[hid].callNumber = cn;
              hseen[hid].callNumberTypeId = cnTypeId;
            }
            if (cn && cn !== hseen[hid].callNumber) {
              ir.itemLevelCallNumber = cn;
              ir.itemLevelCallNumberTypeId = cnTypeId;
            }
            ir.status = {
              name: tmap.statuses[status] || 'Available'
            };

            if (ips === 'WI') {
              ir.status.name = 'Withdrawn';
              ir.discoverySuppress = true;
            } else if (ips === 'OS') {
              ir.temporaryLocationId = refData.locations.OFFSITESTORAGE;
            } else if (ips.match(/^(CT|IP|RC)$/)) {
              ir.status.name = 'In process';
            } else if (ips.match(/^(SR|MI)$/)) {
              ir.status.name = 'Missing';
            } else if (ips === 'NA') {
              ir.status.name = 'Unavailable';
            } else if (ips === 'LO') {
              ir.status.name = 'Long missing';
              ir.discoverySuppress = true; 
            } else if (ips === 'IL') {
              ir.discoverySuppress = true; 
            } else if (ips === 'CA') {
              ir.temporaryLocationId = refData.locations.ORDERCANCELLED;
              ir.discoverySuppress = true; 
            } else if (ips.match(/^(S1|L1|A1|00|1|0)$/)) {
              let nt = refData.itemNoteTypes.Provenance;
              let n = noteGen(`Item Process Status = ${ips}`, nt, 1);
              notes.push(n);
            } else if (ips === 'CL') {
              let nt = refData.itemNoteTypes.Provenance;
              let n = noteGen('Item Process Status = Claimed', nt, 1);
              notes.push(n);
              ir.status.name = 'Unavailable';
            } else if (ips === 'EX') {
              ir.temporaryLocationId = refData.locations.ONEXHIBITION;
              ir.status.name = 'Unavailable';
            } else if (ips.match(/^(OI|OR)$/)) {
              ir.temporaryLocationId = refData.locations.ONORDER;
              ir.status.name = 'On order';
            } else if (ips === 'RS') {
              ir.temporaryLocationId = refData.locations.RESERVES;
            }

            if (bc && !bcused[bc]) {
              ir.barcode = bc;
              bcused[bc] = 1;
            } else {
              console.log(`WARN duplicate barcode found ${bc}`);
              let n = noteGen(`Duplicate barcode: ${bc}`, refData.itemNoteTypes.Note, 1);
              notes.push(n);
            }
            if (vol && htype === 's') {
              ir.enumeration = vol;
            } else if (vol && vol.match(/^c\./)) {
              ir.copyNumber = vol;
            } else {
              if (vol) ir.volume = vol;
            }

            let noteType = refData.itemNoteTypes.Note;
            if (staffNote) {
              let n = noteGen(staffNote, noteType, 1);
              notes.push(n);
            }
            if (pubNote) {
              let n = noteGen(pubNote, noteType, 0);
              notes.push(n);
            }
            if (notes[0]) ir.notes = notes;
            if (circNote) {
              ir.circulationNotes = [
                {
                  noteType: 'Check in',
                  id: uuid(ir.id + circNote + 'i', ns),
                  note: circNote,
                  staffOnly: true
                },
                {
                  noteType: 'Check out',
                  id: uuid(ir.id + circNote + 'o', ns),
                  note: circNote,
                  staffOnly: true
                }
              ]
            }

            // lets deal with bound-with-parts;
            let lm = lsmap[iid];
            if (lm) {
              let ocr = 0;
              lm.hrecs.forEach(h => {
                ocr++;
                let ostr = ocr.toString().padStart(2, '0');
                let hrid = `bw${iid}${ostr}`;
                let hr = {
                  _version: 1,
                  id: uuid(hrid, ns),
                  hrid: hrid,
                  instanceId: instMap[h].id
                }
                if (locId) {
                  hr.permanentLocationId = locId;
                } else {
                  console.log(`WARN [${bid} ${seq}] no location found for:`, coll);
                  let nt = refData.holdingsNoteTypes.Note;
                  let n = noteGen(`Aleph location code: ${coll}`, nt, 1);
                  hr.notes = [n];
                  hr.permanentLocationId = refData.locations.UNMAPPED;
                }
                hr.sourceId = refData.holdingsRecordsSources['FOLIO'];
                hr.callNumber = cn;
                hr.callNumberTypeId = (cnType === '0') ? refData.callNumberTypes['Library of Congress classification'] : refData.callNumberTypes['Other scheme'];
                let htypeName = htypes[htype] || 'Physical';
                hr.holdingsTypeId = refData.holdingsTypes[htypeName];
                if (!hseen[hrid]) {
                  writeJSON(files.holdings, hr);
                  hrc++;
                  hseen[hrid] = hr.id;
                }
                let bwp = {
                  id: uuid(hr.id + ir.id, ns),
                  holdingsRecordId: hr.id,
                  itemId: ir.id
                }
                writeJSON(files.bwp, bwp);
                bwc++;
              });
            }
            iseen[iid] = ir.id;
            irc++;
            // console.log(ir);
            writeJSON(files.items, ir);
          } else {
            console.log('ERROR no holdings record from for', hid);
          }
        } else {
          console.log('ERROR duplicate item found for', iid);
        }
        if (total % 10000 === 0) console.log('Lines read:', total);
      } else {
        console.log('ERROR instance record not found for', bid);
      }
    });
    rl.on('close', () => {
      console.log('Writing holdings records...');
      for (let hr in hseen) {
        writeJSON(files.holdings, hseen[hr]);
      };
      let end = new Date().valueOf()
      let tt = (end - begin)/1000;
      console.log('Done!');
      console.log('Lines processed:', total);
      console.log('Holdings:', hrc);
      console.log('Items:', irc);
      console.log('Relationships:', rlc);
      console.log('Bound withs:', bwc);
      console.log('Total time (secs):', tt);
    });
  }

  const mapLoans = () => {
    console.log('Mapping Loans...');
    let file = mainDir + '/' + inFiles.loans;
    let fileStream = fs.createReadStream(file);
    let rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });

    let ic = 0;
    rl.on('line', r => {
      let j = fieldMap(fmap.loans, r);
      // console.log(j);
      if (j.DOC_NUMBER.match(/^0009/)) {
        let seq = j.ITEM_SEQUENCE.replace(/^..(...)./, '$1');
        let iid = j.DOC_NUMBER + '-' + seq;
        loanMap[iid] = 1;
        ic++
      }
    });
    rl.on('close', () => {
      console.log('Loans mapped:', ic);
      main();
      // console.log(loanMap);
    });
  }

  const mapLinks = () => {
    console.log('Mapping links...');
    let file = mainDir + '/' + inFiles.links;
    let fileStream = fs.createReadStream(file);
    let rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });

    let total = 0;
    let ic = 0;
    rl.on('line', r => {
      total++;
      let j = fieldMap(fmap.links, r);
      if (j.LKR_TYPE === 'ITM') {
        ic++
        // console.log(j);
        let lkey = j.SOURCE_DOC_NUMBER; 
        let parentId = (instMap[j.DOC_NUMBER]) ? instMap[j.DOC_NUMBER].id : '';
        lmap[lkey] = { id: parentId, hrid: j.DOC_NUMBER, seq: '0' + j.SEQUENCE };
        let lskey = j.DOC_NUMBER + '-0' + j.SEQUENCE;
        if (!lsmap[lskey]) lsmap[lskey] = { hr: {}, hrecs: [] };
        lsmap[lskey].hrecs.push(j.SOURCE_DOC_NUMBER);
      }
    });
    rl.on('close', () => {
      console.log('Links found', ic);
      mapLoans();
      // console.log(lmap);
      // console.log(lsmap);
    });
  }

  console.log('Making instance map...')
  let mc = 0;
  let instMap = {}
  let fileStream = fs.createReadStream(mapFile);
  let rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });
  rl.on('line', line => {
    mc++;
    let c = line.split(/\|/);
    let bhrid = c[0];
    instMap[bhrid] = { id: c[1], type: c[4] };
  });
  rl.on('close', c => {
    // console.log(instMap); return;
    console.log('Instance map lines read:', mc);
    mapLinks();
  });

} catch (e) {
  console.error(e.message);
}
