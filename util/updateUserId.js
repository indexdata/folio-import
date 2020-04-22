/* 
  Update the userId field in permissionUsers and servicePoint users.
  Map old user Id via barcode2userIdMap
  Usage: node updateUserId.js <old_map_file> <new_map_file> <file_to_change>
*/

const fs = require('fs');
const oldMapFile = process.argv[2];
const newMapFile = process.argv[3];
const inFile = process.argv[4];

if (!inFile) {
  throw new Error('Usage: node updateUserId.js <old_map_file> <new_map_file> <file_to_change>');
}

const oldMap = require(oldMapFile);
const newMap = require(newMapFile);
const inData = require(inFile);

let oldMapFlipped = {}
for (let x in oldMap) {
  oldMapFlipped[oldMap[x]] = x;
}
// console.log(oldMapFlipped);

let root;
if (inData.servicePointsUsers) {
  root = 'servicePointsUsers';
} else {
  root = 'permissionUsers';
}

let c = 0;
const out = {};
out[root] = [];
inData[root].forEach(r => {
  let oldBc = oldMapFlipped[r.userId];
  if (oldBc && newMap[oldBc]) {
    r.userId = newMap[oldBc];
    out[root].push(r);
    c++;
  }
});
out.totalRecords = c;
console.log(JSON.stringify(out, null, 2));
// console.log(`${c} lines written to ${outFile}...`);
// fs.writeFileSync(outFile, JSON.stringify(out, null, 2));
