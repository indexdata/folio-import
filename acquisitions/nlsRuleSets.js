/*
  Since we can't create deterministic UUIDs for serials objects, we need to map POL numbers to serials ids.
  This script requires the following jsonl files:
  -  serialsOut.jsonl file as returned by serials-management/serials POST requests
  -  ruleSetRaw.jsonl file as created by the nlsSerials.js script
*/

const readline = require('readline');
const fs = require('fs');

let ordDir = process.argv[2];

const files = {
  r: 'rulesets'
};

const ifiles = {
  s: 'serialsOut.jsonl',
  r: 'ruleSetRaw.jsonl'
}

let newDate = new Date();
let start = newDate.valueOf();

const writeOut = (fileName, data) => {
  let line = JSON.stringify(data) + "\n";
  fs.writeFileSync(fileName, line, { flag: 'a' });
}

(async () => {
  try {
    if (!ordDir) throw 'Usage: node nlsRuleSets.js <orders_dir>';

    console.log(`Start: ${newDate}`);

    for (let f in files) {
      let path = `${ordDir}/${files[f]}.jsonl`;
      if (fs.existsSync(path)) fs.unlinkSync(path);
      files[f] = path;
    }

    const d = {};
    for (let f in ifiles) {
      let path = ordDir + '/' + ifiles[f];
      console.log(`Reading ${path}`);
      let fileStream = fs.createReadStream(path);
      let rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
      });
      if (f === 's') {
        d[f] = {};
      } else {
        d[f] = [];
      }
      for await (let line of rl) {
        let j = JSON.parse(line);
        if (f === 's') {
          let k = j.orderLine.remoteId_object.poLineNumber;
          let v = j.id;
          d[f][k] = v;
        } else {
          d[f].push(j);
        }
      }
    }
    // throw(d);
    const ttl = {
      rulesets: 0,
      errors: 0
    }

    d.r.forEach(r => {
      let pn = r.owner.id;
      if (d.s[pn]) {
        // r.id = pn;
        r.owner.id = d.s[pn];
        writeOut(files.r, r);
        ttl.rulesets++;
      } else {
        ttl.errors++;
      }
    });

    console.log('----------------');
    for (let k in ttl) {
      console.log(k, ttl[k]);
    }
  } catch (e) {
    console.log(e);
  }
})();
