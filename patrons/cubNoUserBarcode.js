const fs = require('fs');
const readline = require('readline');
const path = require('path');

const tsvFile = process.argv[2];
const coFile = process.argv[3];

try {
  if (!coFile) throw('Usage: node cubNoUserBarcode.js <tsv_file> <checkout_file>');

  let wd = path.dirname(coFile);
  let outFile = wd + '/' + 'checkouts-updated.jsonl';
  if (fs.existsSync(outFile)) fs.unlinkSync(outFile);
  
  const app = (bcMap) => {
    let fileStream = fs.createReadStream(coFile);
    let rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    }); 
    rl.on('line', l =>{
      let co = JSON.parse(l);
      let k = co.itemBarcode
      let bc = bcMap[k];
      if (bc) {
        co.userBarcode = bc;
        delete(co.errorMessage);
        fs.writeFileSync(outFile, JSON.stringify(co) + '\n', {flag: 'a'});
      }
    });
  }

  let fileStream = fs.createReadStream(tsvFile);
  let rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  const bcMap = {};
  rl.on('line', l => {
    let c = l.split(/\t/);
    let k = c[1];
    let v = c[2];
    bcMap[k] = v;
  });
  rl.on('close', x => {
    app(bcMap);
  });
  

} catch (e) {
  console.log(e)
}