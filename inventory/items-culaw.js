/*
  This script will create Sierra items objects with item data from an item.csv file
  and map it to the appropriate bib num via found in the bno.csv file.
*/
const parse = require('csv-parse/lib/sync');
const fs = require('fs');
const readline = require('readline');
const path = require('path');
const uuid = require('uuid/v5');

const ns = '00000000-0000-0000-0000-000000000000';
const ver = '1';

const itemFile = process.argv[4];
const instMapFile = process.argv[3];
const refDir = process.argv[2];

const files = {
  items: 'items.jsonl',
  holdings: 'holdings.jsonl',
  rel: 'relationships.jsonl',
  bw: 'bound-with-parts.jsonl'
}

const rfiles = {
  locations: 'locations.json',
  mtypes: 'material-types.json',
  holdingsRecordsSources: 'holdings-sources.json',
  holdingsTypes: 'holdings-types.json',
  callNumberTypes: 'call-number-types.json',
  loantypes: 'loan-types.json',
  itemNoteTypes: 'item-note-types.json'
};

const mfiles = {
  // statuses: 'law-statuses.tsv'
}

const htypes = {
  m: 'Monograph',
  s: 'Serial',
  i: 'Multi-part monograph'
};

const opacmsgs = {
  s: 'Superseded',
  l: 'Later edition available',
  n: 'Not updated'
};

const statuses = {
  '!': 'Awaiting pickup',
  z: 'Claimed returned',
  n: 'Declared lost',
  l: 'Declared lost',
  r: 'In process (non-requestable)',
  q: 'In process (non-requestable)',
  t: 'In transit',
  '$': 'Lost and paid',
  m: 'Missing',
  s: 'Missing',
  o: 'Restricted',
  w: 'Withdrawn'
};

(async () => {
  try {
    if (!itemFile) throw(`Usage: node items-culaw.js <ref-dir> <inst-map-file> <item-file.csv>`);

    const startTime = new Date().valueOf();

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

    let dir = path.dirname(itemFile);
    let base = path.basename(instMapFile, '.map');

    for (let f in files) {
      let fullPath = dir + '/' + base + '-' + files[f];
      if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
      files[f] = fullPath;
    }

    // get ref data
    let refData = {};
    for (let prop in rfiles) {
      let rpath = refDir + '/' + rfiles[prop];
      let refObj = require(rpath);
      let arr = refObj[prop];
      refData[prop] = {}
      arr.forEach(e => {
        let key = e.name;
        if (prop.match(/locations/)) {
          key = e.code;
        }
        let id = e.id;
        refData[prop][key] = id;
      });
    }
    // console.log(refData); return;

    // get tsv maps
    toFolio = {}
    for (let f in mfiles) {
      let mfile = refDir + '/' + mfiles[f];
      let fileStream = fs.createReadStream(mfile);
      let rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
      });
      toFolio[f] = {}
      for await (let line of rl) {
        let c = line.split(/\t/);
        let key = c[0];
        let val = c[2];
        if (key) {
          if (f === 'statuses' && val === 'Checked Out') val = 'Available';
          toFolio[f][key] = val;
        }
      }
    }
    // console.log(toFolio); return;

    // get instance map
    console.log('Making instance map...')
    let instMap = {}
    let fileStream = fs.createReadStream(instMapFile);
    let rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });
    for await (let line of rl) {
      let c = line.split(/\|/);
      let bhrid = c[0];
      instMap[bhrid] = {
        id: c[1],
        cn: c[2],
        cntype: c[3],
        blevel: c[4],
        ea: c[5]
      }
    }

    let itemCsv = fs.readFileSync(itemFile, 'utf8');
    itemCsv = itemCsv.replace(/";"/g, '%%');
    itemCsv = itemCsv.replace(/","(b\d{6})/g, '~$1');

    const itemRecs = parse(itemCsv, {
      columns: true,
      skip_empty_lines: true
    });

    /*
    fileStream = fs.createReadStream(bnoFile);

    rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });

    const imap = {};
    for await (let line of rl) {
      line = line.replace(/^"|"$/g, '');
      let c = line.split(/","/);
      let bnum = c.shift();
      bnum = bnum.replace(/.$/, '');
      if (bnum) bnum = 'l' + bnum;
      c.forEach(c => {
        if (c.match(/i\d{5}/)) {
          imap[c] = bnum;
        }
      });
    }
    */

    let hcount = 0;
    let icount = 0;
    let err = 0;
    let bwc = 0;
    let relc = 0;
    let hseen = {};
    let iseen = {};
    let hid;
    itemRecs.forEach(i => {
      let iid = i['RECORD #(ITEM)'];
      // let bhrid = imap[iid];
      let bn = i['RECORD #(BIBLIO)'];
      let bnums = bn.split(/~/);
      let itemId;

      bnums.forEach(bhrid => {
        bhrid = bhrid.replace(/.$/, '');
        bhrid = bhrid.replace(/^/, 'l');
        let instData = instMap[bhrid];
        if (bhrid && instData) {
          let loc = (i.LOC) ? i.LOC.trim() : '';
          let hrid = bhrid + '-' + loc;
          let cn = '';
          let cntype = '';
          let icall = i['CALL #(ITEM)'];
          if (icall) {
            cn = icall;
            cntype = refData.callNumberTypes['Other scheme'];
          } else {
            cn = instData.cn;
            cntype = instData.cntype;
          }
          cn = cn.replace(/^(\w{1,3}) /, '$1');
          let supp = (i.ICODE2 && i.ICODE2 === 's') ? true : false;
          let blevel = instData.blevel;

          // make holdings
          if (!hseen[hrid]) {
            let id = uuid(hrid, ns);
            hseen[hrid] = id;
            hid = id;
            let instId = instData.id || '';
            let locId = refData.locations[loc] || refData.locations.UNMAPPED;
            let htype = htypes[blevel] || 'Monograph';
            let hr = {
              _version: ver,
              id: id,
              hrid: hrid,
              sourceId: refData.holdingsRecordsSources.FOLIO,
              holdingsTypeId: refData.holdingsTypes[htype],
              instanceId: instId,
              permanentLocationId: locId,
              discoverySuppress: supp
            };
            if (cn) {
              hr.callNumber = cn;
              hr.callNumberTypeId = cntype;
            }
            if (instData.ea) {
              hr.electronicAccess = JSON.parse(instData.ea);
            }
            // console.log(hr);
            writeJSON(files.holdings, hr);
            hcount++;
          }
          
          let ihrid = i['RECORD #(ITEM)'];
          if (!iseen[ihrid]) {
            iseen[ihrid] = 1;
            ihrid = 'l' + ihrid;
            itemId = uuid(ihrid, ns);
            let loantypeId = refData.loantypes['Can circulate'];
            let mt = refData.mtypes.unspecified;
            let ir = {
              id: itemId,
              hrid: ihrid,
              holdingsRecordId: hseen[hrid],
              permanentLoanTypeId: loantypeId,
              materialTypeId: mt,
              status: {},
              discoverySuppress: supp
            };
            let bc = i.BARCODE;
            if (bc) {
              let b = bc.split(/%%/);
              ir.barcode = b.shift();
              if (b[0]) {
                if (!ir.notes) ir.notes = [];
                let ntype = refData.itemNoteTypes['Provenance'];
                ir.notes.push(noteGen('Other barcode: ' + b[0], ntype, 1));
              }
            }
            if (icall) {
              ir.itemLevelCallNumber = cn;
              ir.itemLevelCallNumberTypeId = cntype;
            }
            let st = i.STATUS;
            let stname = statuses[st] || 'Available';
            ir.status.name = stname;
            if (i['COPY #']) {
              ir.copyNumber = i['COPY #'];
            }
            let vol = i.VOL;
            if (vol && blevel === 's') {
              ir.enumeration = vol;
            } else if (vol) {
              ir.volume = vol;
            }
            let msg = i['MESSAGE(ITEM)'];
            if (msg) { 
              // ir.descriptionOfPieces = msg;
              // ir.numberOfPieces = msg;
              ir.circulationNotes = [];
              ir.circulationNotes.push({ note: msg, noteType: 'Check in', staffOnly: true});
              ir.circulationNotes.push({ note: msg, noteType: 'Check out', staffOnly: true});
            }
            ir.notes = [];
            let inote = i['NOTE(ITEM)'];
            if (inote) {
              let ntype = refData.itemNoteTypes.Note
              ir.notes.push(noteGen(inote, ntype, true))
            }
            let om = i.OPACMSG;
            if (om && om.match(/[sln]/)) {
              let ntype = refData.itemNoteTypes.Note
              ir.notes.push(noteGen(opacmsgs[om], ntype, false))
            }
            let gn = i.ICODE1;
            if (gn && gn === '1') {
              let ntype = refData.itemNoteTypes.Note
              ir.notes.push(noteGen('Gift copy', ntype, true)) 
            }

            // console.log(ir);
            writeJSON(files.items, ir);
            icount++;
            if (icount % 10000 === 0) console.log(`${icount} items created...`);

          } else {
            let superh = bnums[0].replace(/.$/, '');
            superh = 'l' + superh;
            let superInst = instMap[superh];
            let subInst = instMap[bhrid];
            if (superInst && subInst) {
              let robj = {
                id: uuid(superInst.id + subInst.id, ns),
                superInstanceId: superInst.id,
                subInstanceId: subInst.id,
                instanceRelationshipTypeId: '758f13db-ffb4-440e-bb10-8a364aa6cb4a'
              }
              writeJSON(files.rel, robj);
              relc++;
            }
            if (itemId && hid) {
              let bwObj = {
                id: uuid(itemId + hid, ns),
                itemId: itemId,
                holdingsRecordId: hid,
              }
              writeJSON(files.bw, bwObj);
              bwc++;
            }
          }
        } else {
          if (iid.match(/^i\d/)) {
            console.log(`No bib number found for ${iid}`);
            err++;
          }
        }
      });
    });

    const endTime = new Date().valueOf();
    const secs = (endTime - startTime)/1000;
    console.log('---------------------------');
    console.log('Holdings created:', hcount);
    console.log('Items created:', icount);
    console.log('Relationships:', relc);
    console.log('Bound withs:', bwc);
    console.log('Errors:', err);
    console.log('Timing (secs):', secs);
    console.log('---------------------------');
  } catch (e) {
    console.log(e);
  }
})();
