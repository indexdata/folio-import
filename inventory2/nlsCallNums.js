import fs, { write } from 'fs';
import path from 'path';
import readline from 'readline';

let hfile = process.argv[2];
let ifile = process.argv[3];

let cnTypeId = '6caca63e-5651-4db6-9247-3205156e9699' // Other scheme

let dbug = process.env.DEBUG;
const outs = {};

const files = {
  holdings: 1,
  items: 1
};

const writeOut = (outStream, data, notJson, newLineChar) => {
  let nl = newLineChar || '';
  let dataStr = (notJson !== undefined && notJson) ? data + nl: JSON.stringify(data) + '\n';
  outStream.write(dataStr, 'utf8');
};

const wait = (ms) => {
  console.log(`(Waiting ${ms}ms...)`);
  return new Promise((resolve) => setTimeout(resolve, ms));
};

try {
  if (!ifile) { throw "Usage: node nlsCallNums.js <holdings_file> <items_file>" }
  let wdir = path.dirname(ifile);
  let fn = path.basename(ifile, '.jsonl');
  fn = fn.replace(/^(\w+).*/, '$1')
  let outBase = wdir + '/' + fn;
  for (let f in files) {
    let p = `${outBase}-${f}-cn.jsonl`;
    if (fs.existsSync(p)) fs.unlinkSync(p);
    outs[f] = fs.createWriteStream(p)
  }

  let start = new Date().valueOf();

  const parseLines = async (inFile, cnMap) => {
    let fileStream = fs.createReadStream(inFile);
    let rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });
    let lc = 0;
    let ttl = { holdings: 0, items: 0 }
    for await (let line of rl) {
      lc++;
      let r = JSON.parse(line);
      let c = cnMap[r.id];
      let cns = Object.keys(c.c).sort();
      if (cns.length > 0) {
        r.callNumber = cns.join(', ');
        r.callNumberTypeId = cnTypeId;
      }
      c.i.forEach(i => {
        if (cns.length === 1) {
          delete i.itemLevelCallNumber;
          delete i.itemLevelCallNumberTypeId;
        }
        writeOut(outs.items, i);
        ttl.items++
      });
      if (lc%100000 === 0) console.log(`INFO ${lc} holdings read`);
      writeOut(outs.holdings, r);
      ttl.holdings++;
    }
    return ttl;
  }

  const parseItems = async (inFile, cnMap) => {
    let fileStream = fs.createReadStream(inFile);
    let rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });
    let lc = 0;
    for await (let line of rl) {
      let r = JSON.parse(line);
      let cn = r.itemLevelCallNumber;
      let hid = r.holdingsRecordId;
      if (!cnMap[hid]) cnMap[hid] = { c: {}, i: []};
      cnMap[hid].c[cn] = 1;
      cnMap[hid].i.push(r);
      lc++;
      if (lc%100000 === 0) console.log(`INFO ${lc} items read`);
    }
    return lc;
  }

  const cnMap = {};
  let ic = await parseItems(ifile, cnMap);
  console.log(`INFO ${ic} items mapped`);

  let ttl = await parseLines(hfile, cnMap);
  let end = new Date().valueOf();
  let t = (end - start)/60;
  let m = t/60;
  console.log (`Done in ${t} seconds (${m} min.)`);
  console.log(ttl);

} catch (e) {
  console.log(e);
}