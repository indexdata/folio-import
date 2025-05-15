import fs from 'fs';
import path from 'path';
import readline from 'readline';

let inFile = process.argv[2];

let dbug = process.env.DEBUG;
const suppMap = {};

let today = new Date().toISOString().replace(/T.+/, 'T12:00:00.000+0000');

const writeOut = (outStream, data, notJson, newLineChar) => {
  let nl = newLineChar || '';
  let dataStr = (notJson !== undefined && notJson) ? data + nl: JSON.stringify(data) + '\n';
  outStream.write(dataStr, 'utf8');
};

const wait = (ms) => {
  console.log(`(Waiting ${ms}ms...)`);
  return new Promise((resolve) => setTimeout(resolve, ms));
};

const types = [ 'instances', 'srs' ];

try {
  if (!inFile) { throw "Usage: node suppressInst.js <suppress_jsonl_file>" }
  let wdir = path.dirname(inFile);
  for (let x = 0; x < types.length; x++) {
    let fn = path.basename(inFile);
    let t = types[x];
    fn = fn.replace(/-suppress/, `-${t}`);
    fn = wdir + '/' + fn;
    let start = new Date().valueOf();
    let outFile = wdir + '/' + start;
    if (fs.existsSync(outFile)) fs.unlinkSync(outFile);
    let outStream = fs.createWriteStream(outFile);

    let fileStream = fs.createReadStream(inFile);
    let rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });
    for await (let line of rl) {
      let k = line.replace(/.*"(\d+)".*/, '$1');
      suppMap[k] = 1;
    }
    // throw(suppMap);

    fileStream = fs.createReadStream(fn);
    rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });
    let c = 0;
    let i = 0;
    for await (let line of rl) {
      i++;
      let r = JSON.parse(line);
      let hrid = (t === 'instances') ? r.hrid : r.externalIdsHolder.instanceHrid;
      if (suppMap[hrid]) {
        if (t === 'instances') {
          r.discoverySuppress = true;
        } else {
          r.additionalInfo.suppressDiscovery = true;
        }
        c++;
      }
      writeOut(outStream, r);
    }

    console.log(`${t} read`, i);
    console.log(`${t} suppressed:`, c);
    fs.renameSync(outFile, fn);
  }
} catch (e) {
  console.log(e);
}