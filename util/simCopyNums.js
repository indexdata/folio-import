const fs = require('fs');
const path = require('path');
const readline = require('readline');

const inFile = process.argv[2];

(async () => {
  try {
    if (!inFile) throw('Usage: node simCopyNums.js <item_jsonl_file>');
    
    const dir = path.dirname(inFile);
    const fn = path.basename(inFile, '.jsonl');
    const outFile = `${dir}/${fn}-with-copies.jsonl`;
    if (fs.existsSync(outFile)) fs.unlinkSync(outFile);

    let fileStream = fs.createReadStream(inFile);
    let rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });

    let c = 0;
    let d = 0;
    let hmap = {};
    console.log('Reading file:', inFile);
    for await (const line of rl) {
      c++;
      let j = JSON.parse(line);
      let hid = j.holdingsRecordId;
      if (!hmap[hid]) hmap[hid] = [];
      hmap[hid].push(j);
    }
    console.log('Total lines read:', c);
    for (let hid in hmap) {
	    let l = hmap[hid].length;
	    let s = hmap[hid][0];
	    if (l === 1 && s.copyNumber) {
		 s.copyNumber = "";
		 fs.writeFileSync(outFile, JSON.stringify(s) + '\n', { flag: 'a' });
		 d++;
	    }
    }
	  console.log('Single items with copy num:', d);
	  console.log('Written to:', outFile);

  } catch (e) {
    console.error(e)
  }
})();
