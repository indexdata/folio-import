/* 
This script will grab ids from an existing holdingsRecords collection and match on hrids.  
This is for the purposes of keeping static ids in order to not mess-up any service that is
depending on them (i.e. course reserves, vufind).

This script will take first a collection of existing holdings records and then the new collection
as inputs.
*/

const fs = require('fs');

const staticRecs = process.argv[2];
const newRecs = process.argv[3];

if (! (staticRecs && newRecs)) {
  console.log('Usage: node staticHoldingsId.js <static_collection> <new_collection> [ <match field>,<match field>,... ]');
}

const static = require(staticRecs);
const updated = require(newRecs);
let mkeys = [ 'hrid' ];
if (process.argv[4]) {
  mkeys = process.argv[4].split(/,/);
}
const staticId = {};
const hrid = {};
static.holdingsRecords.forEach(s => {
  let vals = [];
  mkeys.forEach(k => {
    vals.push(s[k]);
  });
  let matchKey = vals.join(':');
  staticId[matchKey] = s.id;
  hrid[matchKey] = s.hrid;
});

updated.holdingsRecords.forEach(u => {
  let vals = [];
  mkeys.forEach(k => {
    vals.push(u[k]);
  });
  let matchKey = vals.join(':');
  if (staticId[matchKey]) {
    u.id = staticId[matchKey];
    u.hrid = hrid[matchKey];
  }
});

const outFile = newRecs.replace(/\.json$/, '_static.json');
console.log(`Writing to ${outFile}`);
fs.writeFileSync(outFile, JSON.stringify(updated, null, 2));