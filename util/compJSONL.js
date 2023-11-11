const fs = require('fs');
const path = require('path');
const readline = require('readline');

const inFile = process.argv[2];
const folFile = process.argv[3];

(async () => {
  try {
    if (!folFile) throw('Usage: node compJSONL.js <local_jsonl_file> <jsonl_file_from_folio');
    
    const dir = path.dirname(inFile);
    const fn = path.basename(inFile, '.jsonl');
    const outFile = `${dir}/${fn}_not_found.jsonl`;
    if (fs.existsSync(outFile)) fs.unlinkSync(outFile);

    let fileStream = fs.createReadStream(folFile);
    let rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });

    let c = 0
    let fol = {};
    console.log('Reading file:', folFile);
    for await (const line of rl) {
      c++;
      let j = JSON.parse(line);
      fol[j.id] = 1;
      if (c%10000 === 0) console.log('Lines read:', c);
    }
    console.log('Total lines read:', c);

    fileStream = fs.createReadStream(inFile);
    rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });

    c = 0
    console.log('Reading file:', folFile);
    for await (const line of rl) {
      c++;
      let j = JSON.parse(line);
      if (!fol[j.id]) {
        console.log('INFO Not found in Folio', j.id);
        fs.writeFileSync(outFile, JSON.stringify(j) + '\n', { flag: 'a' });
      }
      if (c%10000 === 0) console.log('Lines read:', c);
    }
    console.log('Total lines read:', c);
  } catch (e) {
    console.error(e)
  }
})();