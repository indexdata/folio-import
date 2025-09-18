const fs = require('fs');
const path = require('path');
const readline = require('readline');
const jp = require('jsonpath');

const inFile = process.argv[2];
const folFile = process.argv[3];
const extraMatch = process.argv[4];

(async () => {
  try {
    if (!folFile) throw('Usage: node compJSONL.js <jsonl_file_1> <jsonl_file_2> [ <extra_match_property> ]');
    
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
      let k = (extraMatch) ? j.id + '::' + jp.query(j, extraMatch) : j.id;
      fol[k] = 1;
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
      let k = (extraMatch) ? j.id + '::' + jp.query(j, extraMatch) : j.id;
      if (!fol[k]) {
        console.log('INFO Not found in Folio', k);
        fs.writeFileSync(outFile, JSON.stringify(j) + '\n', { flag: 'a' });
      }
      if (c%10000 === 0) console.log('Lines read:', c);
    }
    console.log('Total lines read:', c);
  } catch (e) {
    console.error(e)
  }
})();