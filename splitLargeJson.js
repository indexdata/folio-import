/*
  This script will take a json file and split an array (as defined by property), 
  and write jsonl files with as many lines as defined by size.
*/

const fs = require('fs');
const JSONStream = require('JSONStream');
const es = require('event-stream');

const size = process.argv[2];
const inFile = process.argv[3];
let root = '*';
if (process.argv[4]) {
  root = process.argv[4] + '.*';
}

(async () => {
  try {
    if (!inFile) {
      throw new Error('Usage: node splitLargeJson.js <size> <large_json_file> [ property ]');
    } else if (!fs.existsSync(inFile)) {
      throw new Error('Can\'t find input file');
    }

    const pathRoot = inFile.replace(/\.json$/, '');

    const stream = fs.createReadStream(inFile, { encoding: "utf8" });
    let sz = parseInt(size, 10);
    let c = 0;
    let fn;
    stream
      .pipe(JSONStream.parse(root))
      .pipe(es.through(function write(data) {
          let rec = JSON.stringify(data);
          if (c % sz === 0) {
            let fc = Math.floor(c / sz);
            let fcstr = fc.toString();
            let sufx = fcstr.padStart(5, '0');
            fn = `${pathRoot}${sufx}.jsonl`;
            console.log(`Writing to ${fn}`)
            if (fs.existsSync(fn)) {
              fs.unlinkSync(fn);
            }
          }
          fs.writeFileSync(fn, rec + '\n', { flag: 'a' });
          c++;
        }, 
        function end() {
          this.emit('end')
        })
      ); 

  } catch (e) {
    console.error(e.message);
  } 
})();
