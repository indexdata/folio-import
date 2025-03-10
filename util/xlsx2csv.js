const xlsx = require('xlsx');
const path = require('path');
const fs = require('fs');

const inFile = process.argv[2];
const type = process.argv[3] || 'csv';
const types = {
  csv: ',',
  tsv: '\t'
}

try {
  if (!inFile) throw new Error('Usage: node xlsx2csv.js <xlsx_file> [ output type: csv | tsv ]')
  const dir = path.dirname(inFile);
  let prefix = path.basename(inFile, '.xlsx');
  prefix = prefix.replace(/\..+$/);
  prefix = prefix.replace(/\W/g, '_');

  // Read the file using pathname
  let i = 0;
  const file = xlsx.readFile(inFile);
  for (let sheetName in file.Sheets) {
    let sheet = file.Sheets[sheetName];
    let stream = xlsx.stream.to_csv(sheet, { FS: types[type], blankrows: false});
    let fn = sheetName.replace(/\W+/g, '_');
    let outFile = dir + '/' + `${prefix}.${fn}.${type}`;
    console.log(`Writing to ${outFile}`);
    stream.pipe(fs.createWriteStream(outFile));
  } 
} catch (e) {
  console.error(e.message);
}
