const fs = require('fs');
const readline = require('readline');
const path = require('path');

let inFile = process.argv[2];
let fields = process.argv.slice(3);

try {
  if (!inFile) {
    throw new Error('Usage: $ node parseErrRecs.js <jsonl_with__errMessage_file> [ <fields_to_include>... ]');
  }

  const main = () => {
    let fileStream = fs.createReadStream(inFile);
    let rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });

    let total = 0;
    rl.on('line', r => {
      let j = JSON.parse(r);
      let m = (j._errMessage) ? JSON.parse(j._errMessage) : {};
      let msgs = [];
      let outs = [];
      if (m.errors) {
        m.errors.forEach(e => {
          if (e.message) msgs.push(e.message);
        });
      }
      let mstr = msgs.join('; ');
      fields.forEach(f => {
        let d = j[f];
        if (d) outs.push(d);
      });
      if (total === 0) {
        let heads = [];
        if (fields && fields[0]) heads = [...heads, ...fields];
        heads.push('errMessage');
        let hstr = heads.join('\t');
        console.log(hstr);
      }
      if (mstr) outs.push(mstr);
      let out = outs.join('\t');
      console.log(out);
      total++;
    });
    rl.on('close', () => {
      console.log('Done!');
      console.log('Records parsed:', total);
    });
  }
  main();
} catch (e) {
  console.error(e.message);
}
