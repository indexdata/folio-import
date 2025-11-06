const fs = require('fs');
const path = require('path');
const readline = require('readline');

let refDir = process.argv[2];
let inFile = process.argv[3];

(async () => {
  try {
    if (!inFile) throw('Usage: node viewRecords.js <ref_data_dir> <records_collection>');

    refDir = refDir.replace(/\/$/, '');
    let refData = {};
    let rfiles = fs.readdirSync(refDir);
    rfiles.forEach(f => {
      if (f.match(/\.json$/)) {
        let path = refDir + '/' + f;
        let j = require(path);
        let prop;
        for (let k in j) {
          if (k !== 'totalRecords') prop = k;
        }
        j[prop].forEach(r => {
          refData[r.id] = r.group || r.addressType || r.name || r.code || r.desc || r.value || r.templateName || prop;
        });
      }
    });
    // console.log(refData);

    let fileStream = fs.createReadStream(inFile);
    let rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });

    const parseRec = (rec) => {
      for (let k in rec) {
        if (k === 'id') continue;
        let t = typeof(rec[k])
        if (t === 'string' && rec[k].match(/^........-....-....-....-............$/)) {
          rec[k] = (refData[rec[k]]) ? `${refData[rec[k]]} <${rec[k]}>` : rec[k];
          // rec[k] = (refData[rec[k]]) ? `%%33m^^${refData[rec[k]]}%%0m^^ (%%32m^^${rec[k]}%%0m^^)` : rec[k];
        } else if (t === 'object') {
          parseRec(rec[k]);
        }
      }
      return rec; 
    }

    let c = 0;
    for await (const line of rl) {
      c++;
      let j = JSON.parse(line);
      let out = parseRec(j);
      let outStr = JSON.stringify(out, null, 2);
      outStr = outStr.replace(/%%(\w+)\^\^/gs, '\x1b[$1');
      console.log(outStr);
    }
  } catch (e) {
    console.error(e)
  }
})();