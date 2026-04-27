const fs = require('fs');
const readline = require('readline');
const path = require('path');

let jfile = process.argv[2];

try {
  if (!jfile) {
    throw new Error('Usage: $ node jsonl2csv.js <jsonl_file>');
  }

  const main = () => {
    let fileStream = fs.createReadStream(jfile);
    let rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });

    let dir = path.dirname(jfile);
    let fn = path.basename(jfile, '.jsonl');
    let csvFile = dir + '/' + fn + '.csv';
    let c = 0;
    let head = [];
    let str = '';
    rl.on('line', l => {
      c++;
      let j = JSON.parse(l);
      if (c === 1) {
        head = Object.keys(j);
        str = head.join(',') + '\n';
      }
      let cols = [];
      head.forEach(h => {
        let d = j[h] || '';
        if (d.match(/,/)) d = `"${d}"`;
        cols.push(d);
      });
      str += cols.join(',') + '\n';
    });
    rl.on('close', () => {
      fs.writeFileSync(csvFile, str);
      console.log('Done!');
      console.log(`${c} lines written to ${csvFile}`);
    });
  }

  main();
} catch (e) {
  console.error(e.message);
}
