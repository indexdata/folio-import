const fs = require('fs');
const readline = require('readline');
const uuid = require('uuid/v5');
const path = require('path');

let mapFile = process.argv[2];
let mainDir = process.argv[3];
let etcDir = '../etc/pma';

const ns = '89ff2bcb-b0d2-4ccc-a6e8-cb9b5ca3000e';

const inFiles = {
  links: 'z103.seqaa',
  items: 'items.jsonl',
  holdings: 'holdings.jsonl'
}

const files = {
  holdings: 'bw-holdings.jsonl',
  rel: 'relationships.jsonl',
  bwp: 'bound-with-parts.jsonl'
};

const ffiles = {
  links: 'z103-fields.txt',
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

try {
  if (!mainDir) {
    throw new Error('Usage: $ node pmaRelations.js <inst_map> <relations_dir>');
  }
  if (!fs.existsSync(mainDir)) {
    throw new Error('Can\'t find input file');
  }

  let begin = new Date().valueOf();
  let nowDate = new Date().toISOString().replace(/T.+/, '');

  mainDir = mainDir.replace(/\/$/, '');

  for (let f in files) {
    let fullPath = mainDir + '/' + files[f];
    if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
    files[f] = fullPath;
  }
  // console.log(files); return;

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

  const lmap = {};
  const lsmap = {};
  const loanMap = {};
  const hseen = {};
  const iseen = {};
  const bcused = {};
  const rseen = {};

  const main = () => {
    let mainFile = mainDir + '/' + inFiles.links;
    let fileStream = fs.createReadStream(mainFile);
    let rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });

    let total = 0;
    let hrc = 0;
    let rlc = 0;
    let bwc = 0;
    let ezSeq = 0;
    rl.on('line', r => {
      total++;
      let j = fieldMap(fmap.links, r);
      // console.log(j);
      let dn = j.DOC_NUMBER;
      let ldn = j.LKR_DOC_NUMBER;
      let seq = j.SEQUENCE;
      seq = seq.padStart(3, '0');
      let bid = '';
      let supIn = instMap[dn];
      let subIn = instMap[ldn];
      if (supIn && subIn && j.LKR_TYPE === 'ITM') {
        let rel = {
          superInstanceId: supIn.id,
          subInstanceId: subIn.id,
          instanceRelationshipTypeId: relType
        }
        rel.id = uuid(supIn.id + subIn.id, ns);
        if (!rseen[rel.id]) {
          writeJSON(files.rel, rel);
          rseen[rel.id] = 1;
          rlc++;
        }
        // lets deal with bound-with-parts;

        let ikey = `${dn}-${seq}`;
        let ir = itemMap[ikey];
        if (!ir) {
          for (s = 1; s < 10; s++) {
            let seq = s.toString().padStart(3, '0');
            ikey = `${dn}-${seq}`;
            ir = itemMap[ikey];
            if (ir) break;
          }
        }
        if (ir) {
          let hid = ir.holdingsRecordId;
          let hr = Object.assign({}, holdMap[hid]);
          ldn = ldn.replace(/^0+/, '');
          dn = dn.replace(/^0+/, '');
          hr.hrid = `bw${ldn}-${dn}`;
          hr.id = uuid(hr.hrid, ns);
          hr.instanceId = subIn.id;
          if (hr) {
            if (!hseen[hr.id]) {
              writeJSON(files.holdings, hr);
              hseen[hr.id] = 1;
              hrc++
            }
            let bwp = {
              id: uuid(hr.id + ir.id, ns),
              holdingsRecordId: hr.id,
              itemId: ir.id
            }
            writeJSON(files.bwp, bwp);
            bwc++;
          }
        }
      }
    });
    rl.on('close', () => {
      let end = new Date().valueOf()
      let tt = (end - begin)/1000;
      console.log('Done!');
      console.log('Lines processed:', total);
      console.log('Holdings:', hrc);
      console.log('Relationships:', rlc);
      console.log('Bound withs:', bwc);
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
      main();
      // console.log(lmap);
      // console.log(lsmap);
    });
  }

  let holdMap = {};
  const mapHoldings = () => {
    console.log('Making holdings map...');
    let inFile = `${mainDir}/${inFiles.holdings}`;
    let fileStream = fs.createReadStream(inFile);
    let rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });
    let i = 0;
    rl.on('line', line => {
      i++;
      let j = JSON.parse(line);
      let k = j.id;
      holdMap[k] = j;
    });
    rl.on('close', c => {
      // console.log(holdMap);
      console.log('Holdings read:', i);
      main();
    });
  }

  let itemMap = {};
  const mapItems = () => {
    console.log('Making item map...');
    let itemFile = `${mainDir}/${inFiles.items}`;
    let fileStream = fs.createReadStream(itemFile);
    let rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });
    let i = 0;
    rl.on('line', line => {
      i++;
      let j = JSON.parse(line);
      let k = j.hrid;
      itemMap[k] = j;
    });
    rl.on('close', c => {
      // console.log(itemMap)
      console.log('Items read:', i);
      mapHoldings();
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
    mapItems();
  });

} catch (e) {
  console.error(e.message);
}
