const xlsx = require('xlsx');
const path = require('path');
const fs = require('fs');

const inFile = process.argv[2];
const type = process.argv[3] || 'csv';
const dir = path.dirname(inFile);
const types = {
  csv: ',',
  tsv: '\t'
}

if (!inFile) throw('Usage: node xlsx2csv.js [ output type: csv | tsv ]')

// Read the file using pathname
const file = xlsx.readFile(inFile);
for (let sheetName in file.Sheets) {
  let sheet = file.Sheets[sheetName];
  let stream = xlsx.stream.to_csv(sheet, { FS: types[type], blankrows: false});
  let fn = sheetName.replace(/\W+/g, '_');
  let outFile = dir + '/' + `${fn}.${type}`;
  console.log(`Writing to ${outFile}`);
  stream.pipe(fs.createWriteStream(outFile));
}


