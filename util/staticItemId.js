/* 
This script will grab ids from an existing items collection (most likely harvested using downloadAllItems.js) 
and match on formerIds.

This is for the purposes of keeping static ids in order to not mess-up any service that is
depending on them (i.e. course reserves, vufind).

This script will take first a collection of existing holdings records and then the new collection
as inputs.
*/

const fs = require('fs');

const staticRecs = process.argv[2];
const newRecs = process.argv[3];

if (!(staticRecs && newRecs)) {
  const mesg = 'Usage: node staticItemsId.js <static_collection> <new_collection>';
  console.log(mesg);
  return;
}


const static = require(staticRecs);
const updated = require(newRecs);
const staticIds = {};
static.items.forEach(s => {
  let matchKey = s.formerIds[0];
  staticIds[matchKey] = { id: s.id, hrid: s.hrid, holdingsRecordId: s.holdingsRecordId };
});

updated.items.forEach(u => {
  let matchKey = u.formerIds[0];
  if (staticIds[matchKey]) {
    u.id = staticIds[matchKey].id;
    u.hrid = staticIds[matchKey].hrid;
    u.holdingsRecordId = staticIds[matchKey].holdingsRecordId;
  }
});

const outFile = newRecs.replace(/\.json$/, '_static.json');
console.log(`Writing to ${outFile}`);
fs.writeFileSync(outFile, JSON.stringify(updated, null, 2));