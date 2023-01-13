const fs = require('fs');
const readline = require('readline');
const path = require('path');

let inFile = process.argv[2];

(async () => {
  try {
    const start = new Date().valueOf();
    if (!inFile) {
      throw 'Usage: node dedupeJSONL.js <jsonl_file>';
    } else if (!fs.existsSync(inFile)) {
      throw new Error('Can\'t find input file');
    } 

    const workingDir = path.dirname(inFile);
    const baseName = path.basename(inFile, '.jsonl');
    const outPath = `${workingDir}/${baseName}_deduped.jsonl`;
    if (fs.existsSync(outPath)) {
      fs.unlinkSync(outPath);
    }
    
    const fileStream = fs.createReadStream(inFile);

    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });

    let x = 0;
    let seen = {};
    let c = 0;
    for await (const line of rl) {
      let rec = JSON.parse(line);
      let id = rec.id;
      if (seen[id]) {
        x++;
      } else {
        fs.writeFileSync(outPath, line + '\n', { flag: 'a' });
        seen[id] = 1;
      }
      c++
      if (c % 100000 === 0) {
	console.log('Lines read:', c, `(Dupes found: ${x})`);
      }
    }
    console.log(`${x} dupes found and saved to ${outPath}`);
  } catch (e) {
    console.error(e);
  }
})();
