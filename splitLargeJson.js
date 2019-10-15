const fs = require('fs');
const JSONStream = require('JSONStream');
const es = require('event-stream');

const size = process.argv[2];
const inFile = process.argv[3];

(async () => {
  try {
    if (!inFile) {
      throw new Error('Usage: node splitLargeJson.js <size> <large_json_file> [ property ]');
    } else if (!fs.existsSync(inFile)) {
      throw new Error('Can\'t find input file');
    }

    const smallerObject = (data, es) => {
      console.log(data);
      es.resume();
    }
  
    const pathRoot = inFile.replace(/\.json$/, '');

    const stream = fs.createReadStream(inFile, { encoding: "utf8" });
    let sz = parseInt(size, 10);
    let c = 0;
    stream
      .pipe(JSONStream.parse('*'))
      .pipe(es.through(function write(data) {
          let fc = Math.floor(c / sz);
          let fcstr = fc.toString();
          let sufx = fcstr.padStart(5, '0');
          let fn = `${pathRoot}${sufx}.json`;
          if (c % sz === 0 && fs.existsSync(fn)) {
            console.log(fn);
            fs.unlinkSync(fn);
          }
          let rec = JSON.stringify(data, null, 2);
          fs.writeFileSync(fn, rec, { flag: 'a' });
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
