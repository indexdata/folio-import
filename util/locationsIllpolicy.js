/* 
  This script will take a list of locations and find the illPolicyId from a collection
  of holdings records and return a TSV report file.
*/

const locsFile = process.argv[2];
const holdFile = process.argv[3];

if (!holdFile) throw new Error(`Usage: node locationsIllpolicy.js <location file> <holdings file>`);

locs = require(locsFile);
holdings = require(holdFile);

const illMap = {
  '46970b40-918e-47a4-a45d-b1677a2d3d46': 'Will lend',
  'b0f97013-87f5-4bab-87f2-ac4a5191b489': 'Will not lend'
}

let hmap = {}
holdings.holdingsRecords.forEach(h => {
  if (h && h.permanentLocationId) hmap[h.permanentLocationId] = h.illPolicyId
});

locs.locations.forEach(l => {
  let illId = hmap[l.id];
  let illStr = illMap[illId] || 'Not used';
  let out = `${l.name}\t${l.code}\t${illStr}`
  console.log(out);

});