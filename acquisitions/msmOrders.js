const fs = require('fs');
const uuid = require('uuid/v5');
const path = require('path');
const { parse } = require('csv-parse/sync');
const readline = require('readline');

let refDir = process.argv[2];
const instFile = process.argv[3];
const inFile = process.argv[4];
const filter = process.argv[5];
const ns = 'eab3e237-5dc1-4a4b-b4da-5ab5acc3d0ee';

const files = {
  co: 'composite-orders.jsonl',
  ord: 'purchase-orders.jsonl',
  pol: 'pol-lines.jsonl'
};

const rfiles = {
  organizations: 'organizations.json',
  funds: 'funds.json',
  acquisitionMethods: 'acquisition-methods.json'
};

(async () => {
  try {
    if (!inFile) throw(`Usage: node msmOrders.js <ref_dir> <instances_jsonl> <orders_csv_file> [ <filter_field> ]`);

    const dir = path.dirname(inFile);
    refDir = refDir.replace(/\/$/, '');

    for (let f in files) {
      let fn = dir + '/' + files[f];
      if (fs.existsSync(fn)) {
        fs.unlinkSync(fn);
      }
      files[f] = fn;
    }
    // throw(files);

    const refData = {};
    for (let f in rfiles) {
      let rfile = refDir + '/' + rfiles[f];
      let rdata = require(rfile);
      refData[f] = {};
      rdata[f].forEach(r => {
        let k = r.name || r.value;
        let c = r.code;
        let v = r.id;
        if (k && v) refData[f][k] = v;
        if (c && v) refData[f][c] = v;
      });
    }
    // throw(refData);

    console.log(`INFO Creating instance map...`);
    let instMap = {};
    let fileStream = fs.createReadStream(instFile);
    let rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });
    let icount = 0;
    for await (let line of rl) {
      icount++;
      let j = JSON.parse(line);
      instMap[j.hrid] = j;
    }
    console.log(`INFO Instances parsed: ${icount}`);

    const writeTo = (fileName, data) => {
      let outStr = JSON.stringify(data) + '\n';
      fs.writeFileSync(fileName, outStr, { flag: 'a' });
    }

    const reqFields = (object, fieldList) => {
      let out = true;
      fieldList.forEach(k => {
        if (out === true && !object[k]) {
          out = false;
          console.log(`ERROR missing required field: "${k}"`);
        }
      
      });
      return out;
    }

    const csv = fs.readFileSync(`${inFile}`, 'utf8');
    const inRecs = parse(csv, {
      columns: true,
      skip_empty_lines: true,
      from: 1
    });
    // throw(inRecs); 

    const seen = {};
    const ttl = { count: 0, purchaseOrders: 0, Pols: 0};
    for (let x = 0; x < inRecs.length; x++) {
      let r = inRecs[x];
      if (filter && !r[filter]) continue;
      ttl.count++;
      if (process.env.DEBUG) console.log(r);
    }

    console.log('Finished!');
    for (let k in ttl) {
      console.log(`${k}: `, ttl[k]);
    }
  } catch (e) {
    console.log(e);
  }
})();
