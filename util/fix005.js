const fs = require('fs');
const readline = require('readline');
const path = require('path');

let inFile = process.argv[2];

const writeJSON = (fn, data) => {
  const out = JSON.stringify(data) + "\n";
  fs.writeFileSync(fn, out, { flag: 'a' });
}

try {
  if (!inFile) {
    throw new Error('Usage: $ node fix005.js <srs_jsonl_file>');
  }

  let dir = path.dirname(inFile);
  let base = path.basename(inFile, '.jsonl');
  let outFile = dir + '/' + base + '-fixed.jsonl';
  if (fs.existsSync(outFile)) fs.unlinkSync(outFile);

  const dateCheck = (date) => {
    try {
      let vdate = date.replace(/^(....)(..)(..)(..)(..)(..).*/, '$1-$2-$3:$4:$5:$6');
      new Date(vdate).toISOString();
      return true;
    } catch (e) {
      return false;
    }
  }

  const main = () => {
    let mainFile = inFile;
    let fileStream = fs.createReadStream(inFile);
    let rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });

    const ttl = {
      count: 0,
      fixed: 0,
    }

    rl.on('line', l => {
      ttl.count++;
      let r = JSON.parse(l);
      let fixed = false;
      if (r.parsedRecord) {
        r.parsedRecord.content.fields.forEach(f => {
          if (f['005'] && !f['005'].match(/^\d{14}\.\d$/)) {
            let p = f['005'].split(/\./);
            let v = dateCheck(p[0]);
            if (!v) {
              p[0] = p[0].replace(/^(\d{8}).*/, '$1000000');
              v = dateCheck(p[0]);
            }
            if (!v) {
              p[0] = '20250101000000';
              v = dateCheck(p[0]);
            }
            if (v) {
              p[0] = p[0].replace(/\s/g, '0');
              let d = (p[0].length < 14) ? p[0].substring(0,8) : p[0].substring(0,14);
              d = d.padEnd(14, '0');
              d += '.0';
              f['005'] = d;
              fixed = true;
            }
          } else if (f['005']) {
            let v = dateCheck(f['005']);
            if (!v) {
              f['005'] = f['005'].replace(/^(\d{8}).*/, '$1000000.0');
              v = dateCheck(f['005']);
              if (v) fixed = true;
            }
            if (!v) {
              f['005'] = '20250101000000.0';
              fixed = true;
            }
          } 
        });
      }
      if (fixed) {
        writeJSON(outFile, r);
        ttl.fixed++;
      }
    });
    rl.on('close', () => {
      console.log('Done!');
      console.log('Processed:', ttl.count);
      console.log('Fixed:', ttl.fixed);
    });
  }

  main();
} catch (e) {
  console.error(e.message);
}
