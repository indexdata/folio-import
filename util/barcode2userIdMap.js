const fs = require('fs');
const inFile = process.argv[2];
const users = require(inFile);
let outFile = inFile.replace(/^(.+)\/.+/, '$1/userBarcodeMap.json');

let c = 0;
const out = {};
users.users.forEach(u => {
  out[u.barcode] = u.id;
  c++;
});
console.log(`${c} lines written to ${outFile}...`);
fs.writeFileSync(outFile, JSON.stringify(out, null, 2));
