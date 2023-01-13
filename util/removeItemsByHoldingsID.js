const fs = require('fs');
const readline = require('readline');
const path = require('path');

let idFile = process.argv[2];
let inFile = process.argv[3];

(async () => {
  try {
    const start = new Date().valueOf();
    if (!inFile) {
      throw 'Usage: node removeItemsByHoldingsID <id_file> <jsonl_file>';
    } else if (!fs.existsSync(inFile)) {
      throw new Error('Can\'t find input file');
    } 

    const workingDir = path.dirname(inFile);
    const baseName = path.basename(inFile, '.jsonl');
    const outPath = `${workingDir}/${baseName}_clean.jsonl`;
    if (fs.existsSync(outPath)) {
      fs.unlinkSync(outPath);
    }
    
    let fileStream = fs.createReadStream(idFile);

    let rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });

    const hids = {};
    for await (const line of rl) {
	    hids[line] = 1;
    } 

    fileStream = fs.createReadStream(inFile);

    rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });

    let x = 0;
    let c = 0;
    for await (const line of rl) {
      let rec = JSON.parse(line);
      let hid = rec.holdingsRecordId;
      if (hids[hid]) {
        x++;
      } else {
        fs.writeFileSync(outPath, line + '\n', { flag: 'a' });
      }
      c++
      if (c % 100000 === 0) {
	console.log('Lines read:', c, `(deletes: ${x})`);
      }
    }
    console.log(`${x} deletes found, records saved to ${outPath}`);
  } catch (e) {
    console.error(e);
  }
})();
