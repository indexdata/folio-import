const xlsx = require('xlsx');
const path = require('path');
const fs = require('fs');

const inFile = process.argv[2];
const dir = path.dirname(inFile);

// Read the file using pathname
const file = xlsx.readFile(inFile);
for (let sheetName in file.Sheets) {
  let sheet = file.Sheets[sheetName];
  let stream = xlsx.stream.to_csv(sheet);
  let fn = sheetName.replace(/\W+/g, '_');
  let outFile = dir + '/' + `${fn}.csv`;
  console.log(`Writing to ${outFile}`);
  stream.pipe(fs.createWriteStream(outFile));
}


