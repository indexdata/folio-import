const fs = require('fs');
const readline = require('readline');
const uuid = require('uuid/v5');
const path = require('path');

const refDir = process.argv[2];
const mapFile = process.argv[3]
const sifFile = process.argv[4];

const ns = '89ff2bcb-b0d2-4ccc-a6e8-cb9b5ca3000e';

const files = {
  items: 'items.jsonl',
  holdings: 'holdings.jsonl',
  rel: 'relationships.jsonl',
  bw: 'bound-with-parts.jsonl'
};

const rfiles = {
  locations: 'locations.json',
  mtypes: 'material-types.json',
  holdingsRecordsSources: 'holdings-sources.json',
  holdingsTypes: 'holdings-types.json',
  callNumberTypes: 'call-number-types.json',
  loantypes: 'loan-types.json',
  itemNoteTypes: 'item-note-types.json'
};

const getData = (record, offset, length, format) => {
  let start = offset;
  let end = start + length;
  let data = record.substring(start, end);
  data = data.trim();
  if (data) {
    if (format === 'n') {
      data = data.replace(/^0+/, '');
    }
    if (format === 'd') {
      data = data.replace(/(\d{4})(\d\d)(\d\d)/g, '$1-$2-$3');
    }
  }
  return data;
};

const writeJSON = (fn, data) => {
  const out = JSON.stringify(data) + "\n";
  fs.writeFileSync(fn, out, { flag: 'a' });
}

try {
  if (sifFile === undefined) {
    throw new Error('Usage: $ node items-pma.sh <ref_dir> <inst_map> <z30_file>');
  }
  if (!fs.existsSync(sifFile)) {
    throw new Error('Can\'t find input file');
  }

  let begin = new Date().valueOf();

  let dir = path.dirname(sifFile);
  let base = path.basename(mapFile, '.map');

  for (let f in files) {
    let fullPath = dir + '/' + base + '-' + files[f];
    if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
    files[f] = fullPath;
  }

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

  console.log('Making instance map...')
  let instMap = {}
  let fileStream = fs.createReadStream(mapFile);
  let rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });
  rl.on('line', line => {
    let c = line.split(/\|/);
    let bhrid = c[0];
    instMap[bhrid] = c[1];
  });
  rl.on('close', c => {
    main();
  });

  bseen = {};
  hseen = {};

  const makeHoldings = (ai) => {
    let hr = {};
    let bid = ai.bibId;
    let hkey = bid + ai.coll + ai.cn;
    console.log(hkey);
    if (!bseen[bid]) {
      bseen[bid] = 1;
    } else {
      bseen[bid]++;
    }
    hr.hrid = ai.bibId + '-' + `${bseen[bid]}`.padStart(3,0);
    hr.id = uuid(hr.hrid, ns);
    hr.instanceId = ai.instId;
    hr.permanentLocationId = refData.locations[ai.coll];
    hr.sourceId = refData.holdingsRecordsSources['FOLIO'];
    hr.callNumber = ai.cn;
    hr.callNumberTypeId = (ai.cnType === '0') ? refData.callNumberTypes['Library of Congress classification'] : refData.callNumberTypes['Other scheme'];
    return hr
  }

  const main = () => {
    fileStream = fs.createReadStream(sifFile);
    rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });

    let total = 0;
    let hrc = 0;
    rl.on('line', r => {
      total++;
      let ai = {};
      ai.bibId = getData(r, 0, 9);
      ai.iseq = getData(r, 9, 6, 'n');
      ai.bc = getData(r, 14, 30, 'n');
      ai.subLib = getData(r, 44, 5);
      ai.mtype = getData(r, 49, 6);
      ai.status = getData(r, 55, 2);
      ai.odate = getData(r, 57, 8, 'd');
      ai.udate = getData(r, 65, 8, 'd');
      ai.coll = getData(r, 119, 5);
      ai.cnType = getData(r, 124, 1);
      ai.cn = getData(r, 125, 80);
      ai.cnType2 = getData(r, 285, 1);
      ai.cn2 = getData(r, 286, 80);
      ai.vol = getData(r, 366, 200);
      ai.pubNote = getData(r, 566, 200);
      ai.circNote = getData(r, 766, 200);
      ai.staffNote = getData(r, 966, 200);
      if (ai.cn) ai.cn = ai.cn.replace(/\$\$./g, ' ').trim();

      ai.instId = instMap[ai.bibId];
      if (ai.instId) {
        let hr = makeHoldings(ai);
        hrc++;
        if (process.env.DEBUG) {
          // console.log(ai);
          console.log(hr);
        }
        writeJSON(files.items, ai);
      }
      
      
    });
    rl.on('close', () => {
      let end = new Date().valueOf()
      let tt = (end - begin)/1000;
      console.log('Done!');
      console.log('Lines processed:', total);
      console.log('Holdings:', hrc);
      console.log('Total time (secs):', tt);
    });
  }
} catch (e) {
  console.error(e.message);
}
