/*

  This script is useful for finding records that did not migrate to Folio.
  
  Usage: comp.js <record_collection_file> <records_collection_file_from_folio>

  It will find ids that in the first file that don't exist in the second file
  and spit out a new collection of records.

*/

let inFile = require(process.argv[2]);
let inFolio = require(process.argv[3]);

let fileProp;
let folioProp;

for (let x in inFile) {
	if (Array.isArray(inFile[x])) {
		fileProp = x;
	}
}

for (let x in inFolio) {
	if (Array.isArray(inFolio[x])) {
		folioProp = x;
	}
}

const ids = {};

inFolio[folioProp].forEach(r => {
	ids[r.id] = 1;
});

let c = 0;
const out = {};
out[fileProp] = [];
inFile[fileProp].forEach(r => {
	if (!ids[r.id]) {
		c++;
		out[fileProp].push(r);
	}
});

out.totalRecords = c;
console.log(JSON.stringify(out, null, 2));
