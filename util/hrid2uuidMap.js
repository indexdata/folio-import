const fs = require('fs');
const inFile = process.argv[2];
const inst = require(inFile);
let outFile = inFile.replace(/^(.+)\/.+/, '$1/inst2holdingsMap.json');

const out = {};
inst.instances.forEach(i => {
  out[i.hrid] = i.id;
});
fs.writeFileSync(outFile, JSON.stringify(out, null, 2));
