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
  links: 'z103.seqaa'
}
if (process.env.TEST) inFiles.items = 'test.seqaa';

const files = {
  holdings: 'holdings.jsonl',
  items: 'items.jsonl'
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
      tmap[prop][key] = (refData[prop]) ? refData[prop][val] : val;
    });
  }
  // console.log(tmap); return;

 

  const lmap = {};
  const hseen = {};
  const iseen = {};
  const bcused = {};

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
    let erc = 0;
    rl.on('line', r => {
      total++;
      let j = fieldMap(fmap.items, r);
      // console.log(j);
      let bid = j.DOC_NUMBER;
      let hid = j.HOL_DOC_NUMBER;
      let seq = j.ITEM_SEQUENCE.replace(/^00(.+).$/, '$1');
      let iid = bid + '-' + seq;
      let inst = instMap[bid];
      let coll = j.COLLECTION;
      let locId = refData.locations[coll];
      let cn = j.CALL_NO;
      let cnType = j.CALL_NO_TYPE;
      let htype = inst.mtype;
      let mtype = j.MATERIAL;
      let status = j.ITEM_STATUS;
      let bc = j.BARCODE;
      let vol = j.DESCRIPTION;
      let staffNote = j.NOTE_INTERNAL;
      let pubNote = j.NOTE_OPAC;
      let circNote = j.NOTE_CIRCULATION;
      let link = lmap[iid];
      console.log(link);
      if (cn) cn = cn.replace(/\$\$./g, ' ').trim();
      if (inst) {
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
          hr.callNumberTypeId = (cnType === '0') ? refData.callNumberTypes['Library of Congress classification'] : refData.callNumberTypes['Other scheme'];
          let htypeName = htypes[htype] || 'Physical';
          hr.holdingsTypeId = refData.holdingsTypes[htypeName];
          hrc++;
          // console.log(j), console.log(hr);
          writeJSON(files.holdings, hr);
          hseen[hid] = hr.id;
        }
        if (!iseen[iid]) {
          if (hseen[hid]) {
            let ir = {
              _version: '1',
              id: uuid(iid, ns),
              hrid: iid,
              holdingsRecordId: hseen[hid]
            };
            ir.materialTypeId = tmap.mtypes[mtype] || refData.mtypes['unspecified'];
            ir.permanentLoanTypeId = refData.loantypes['Can circulate'];
            ir.status = {
              name: tmap.statuses[status] || 'Available'
            };
            if (bc && !bcused[bc]) {
              ir.barcode = bc;
              bcused[bc] = 1;
            } else {
              console.log(`WARN duplicate barcode found ${ai.bc}`);
            }
            if (vol && htype === 's') {
              ir.enumeration = vol;
            } else if (vol && vol.match(/^c\./)) {
              ir.copyNumber = vol;
            } else {
              if (vol) ir.volume = vol;
            }

            let notes = [];
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

            iseen[iid] = ir.id;
            irc++;
            console.log(ir);
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
      let end = new Date().valueOf()
      let tt = (end - begin)/1000;
      console.log('Done!');
      console.log('Lines processed:', total);
      console.log('Holdings:', hrc);
      console.log('Items:', irc);
      console.log('Total time (secs):', tt);
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
        let lkey = j.SOURCE_DOC_NUMBER + '-0' + j.SEQUENCE; 
        lmap[lkey] = j.DOC_NUMBER;
      }
    });
    rl.on('close', () => {
      console.log('Links found', ic);
      main();
      // console.log(lmap);
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
