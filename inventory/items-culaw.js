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

const itemFile = process.argv[5];
const bnoFile = process.argv[4];
const instMapFile = process.argv[3];
const refDir = process.argv[2];

const files = {
  items: 'items.jsonl',
  holdings: 'holdings.jsonl'
}

const rfiles = {
  locations: 'locations.json',
  mtypes: 'material-types.json',
  holdingsRecordsSources: 'holdings-sources.json',
  holdingsTypes: 'holdings-types.json',
  callNumberTypes: 'call-number-types.json',
  loantypes: 'loan-types.json'
};

const mfiles = {
  statuses: 'law-statuses.tsv'
}

htypes = {
  m: 'Monograph',
  s: 'Serial',
  i: 'Multi-part monograph'
};

(async () => {
  try {
    if (!itemFile) throw(`Usage: node items-culaw.js <ref-dir> <inst-map-file> <bno-file.csv> <item-file.csv>`);

    const writeJSON = (fn, data) => {
      const out = JSON.stringify(data) + "\n";
      fs.writeFileSync(fn, out, { flag: 'a' });
    }

    let dir = path.dirname(bnoFile);
    let base = path.basename(instMapFile, '.map');

    for (let f in files) {
      let fullPath = dir + '/' + base + '_' + files[f];
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
          toFolio[f][key] = val;
        }
      }
    }
    // console.log(toFolio); return;

    // get instance map
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
    // console.log(instMap);

    let itemCsv = fs.readFileSync(itemFile, 'utf8');
    itemCsv = itemCsv.replace(/";"/g, '%%');

    const itemRecs = parse(itemCsv, {
      columns: true,
      skip_empty_lines: true
    });

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

    let hcount = 0;
    let icount = 0;
    let err = 0;
    let hseen = {};
    let hid;
    itemRecs.forEach(i => {
      let iid = i['RECORD #(ITEM)'];
      let bhrid = imap[iid];

      // start making holdings and items
      if (bhrid) {
        let loc = (i.LOC) ? i.LOC.trim() : '';
        let hrid = bhrid + '-' + loc;
        let cn = '';
        let cntype = '';
        let icall = i['CALL #(ITEM)'];
        if (icall) {
          cn = icall;
          cntype = refData.callNumberTypes['Other scheme'];
        } else {
          cn = instMap[bhrid].cn;
          cntype = instMap[bhrid].cntype;
        }
        cn = cn.replace(/^(\w{1,3}) /, '$1');
        let supp = (i.ICODE2 && i.ICODE2 === 's') ? true : false;

        // make holdings
        if (!hseen[hrid]) {
          hseen[hrid] = 1;
          let id = uuid(hrid, ns);
          hid = id;
          let instData = instMap[bhrid];
          let instId = instData.id || '';
          let locId = refData.locations[loc] || refData.locations.UNMAPPED;
          let htype = htypes[instData.blevel] || 'Monograph';
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
        ihrid = 'l' + ihrid;
        let iid = uuid(ihrid, ns);
        let loantypeId = refData.loantypes['Can circulate'];
        let mt = refData.mtypes.unspecified;
        let ir = {
          id: iid,
          hrid: ihrid,
          holdingsRecordId: hid,
          permanentLoanTypeId: loantypeId,
          materialTypeId: mt,
          status: {},
          discoverySuppress: supp
        };
        if (icall) {
          ir.itemLevelCallNumber = cn;
          ir.itemLevelCallNumberTypeId = cntype;
        }
        let st = i.STATUS;
        let stname = toFolio.statuses[st] || 'Unknown'
        ir.status.name = stname;
        console.log(ir);

      } else {
        console.log(`No bib number found for ${iid}`);
        err++;
      }
    });
    console.log('Holdings created:', hcount);
    console.log('Items created:', icount);
    console.log('Errors:', err);
  } catch (e) {
    console.log(e);
  }
})();
