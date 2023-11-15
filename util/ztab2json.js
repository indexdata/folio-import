const fs = require('fs');
const readline = require('readline');
const uuid = require('uuid/v5');
const path = require('path');

let mapFile = process.argv[2];
let zfile = process.argv[3];

const fieldMap = (fmap, record) => {
  let f = {};
  for (let k in fmap) {
    let v = fmap[k];
    let d = record.substring(v[0], v[1]).trim();
    f[k] = d;
  }
  return f;
}

const writeJSON = (fn, data) => {
  const out = JSON.stringify(data) + "\n";
  fs.writeFileSync(fn, out, { flag: 'a' });
}

try {
  if (!zfile) {
    throw new Error('Usage: $ node ztab2json.js <zmap_file> <zfile>');
  }

  const fmap = {};
  let file = mapFile;
  let fields = fs.readFileSync(file, { encoding: 'utf8' });
  let cstart = 0;
  fields.split(/\n/).forEach(f => {
    let d = f.match(/^.+?-(.+) PICTURE.*\((\d+).+/);
    if (d) {
      let k = d[1];
      let v = d[2]
      v = parseInt(v, 10);
      k = k.replace(/\W/g, '_');
      let cend = cstart + v;
      fmap[k] = [ cstart, cend, v ];
      cstart = cend;
    }
  });
  // console.log(fmap); return;

  const main = () => {
    let mainFile = zfile;
    let fileStream = fs.createReadStream(mainFile);
    let rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });

    let total = 0;
    rl.on('line', r => {
      total++;
      let j = fieldMap(fmap, r);
      let jstr = JSON.stringify(j);
      console.log(jstr);
    });
    rl.on('close', () => {
      console.log('Done!');
    });
  }

  main();
} catch (e) {
  console.error(e.message);
}
