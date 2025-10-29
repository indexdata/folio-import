const fs = require('fs');
const path = require('path');
const readline = require('readline');
const jp = require('jsonpath');

let inFile = process.argv[2];
let folFile = process.argv[3];

(async () => {
  try {
    if (!folFile) throw('Usage: node matchJSONL.js <jsonl_file_1@property> <jsonl_file_2@property>');

    let p1 = inFile.replace(/^.+@/, '');
    inFile = inFile.replace(/@.+$/, '');
    let p2 = folFile.replace(/^.+@/, '');
    folFile = folFile.replace(/@.+$/, '');
    if (p1 === inFile || p2 === folFile) {
      throw('You must define a match property!');
    }
    
    const dir = path.dirname(folFile);
    const fn = path.basename(folFile, '.jsonl');
    const outFile = `${dir}/${fn}_match.jsonl`;
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
      let k = j[p2];
      fol[k] = line;
      if (c%10000 === 0) console.log('Lines read:', c);
    }
    console.log('Lines read:', c, '<--', folFile);
    // console.log(fol); return;

    fileStream = fs.createReadStream(inFile);
    rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });

    c = 0;
    let found = 0;
    let seen = {};
    console.log('Reading file:', inFile);
    for await (const line of rl) {
      c++;
      let j = JSON.parse(line);
      let k = j[p1];
      if (fol[k]) {
        if (!seen[k]) {
          fs.writeFileSync(outFile, fol[k] + '\n', { flag: 'a' });
          found++;
          seen[k] = 1;
        }
      }
      if (c%10000 === 0) console.log('Lines read:', c);
    }
    console.log('--------------------');
    console.log('Lines read:   ', c, '<--', inFile);
    console.log('Matches found:', found, '-->', outFile);
  } catch (e) {
    console.error(e)
  }
})();