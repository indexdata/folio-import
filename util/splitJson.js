// Usage: node splitJson.js <filename> <size> [<root_property>]
const fs = require('fs');

const inFile = process.argv[2];
const size = parseInt(process.argv[3], 10);
const root = process.argv[4];
const path = inFile.replace(/^(.+)\/.+/, '$1');
const fileName = inFile.replace(/(^.+\/)?(.+)\.json/, '$2');

let inData = require(`./${inFile}`);
if (root) {
  inData = inData[root];
}
let count = 0;
let out = {};
let records = [];
let fcount = 0;
inData.forEach((r, dx) => {
  records.push(r);
  count++;
  if (count === size || dx === inData.length - 1) {
    if (root) {
      out[root] = records;
    } else {
      out = records;
    }
    let fn = String(fcount).padStart(5, '0');
    let savePath = `${path}/${fileName}_${fn}.json`;
    console.log(`Saving to ${savePath}`);
    outStr = JSON.stringify(out, null, 2);
    fs.writeFileSync(savePath, outStr);
    fcount++;
    count = 0;
    records = [];
  }
});
