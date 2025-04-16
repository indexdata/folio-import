const fs = require('fs');
const readline = require('readline');
const path = require('path');

const sfile = process.argv[2];
const ffile = process.argv[3];

try {
  if (!ffile) throw('Usage: node cuPatronMerge.js <folio_file> <file_to_change>');

  let wd = path.dirname(ffile);
  let outFile = wd + '/' + 'users-updated.jsonl';
  if (fs.existsSync(outFile)) fs.unlinkSync(outFile);

  const bigFile = (umap) => {
    let fileStream = fs.createReadStream(sfile);
    let rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });
    let c = 0;
    rl.on('line', l =>{
      let r = JSON.parse(l);
      let un = r.username;
      let id = (umap[un]) ? umap[un] : '';
      if (id) {
        r.id = id;
        fs.writeFileSync(outFile, JSON.stringify(r) + '\n', {flag:'a'});
        c++;
      }
    });
    rl.on('close', x => {
      console.log(c);
    });
  };

  let fileStream = fs.createReadStream(ffile);
  let rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  const umap = {};
  rl.on('line', line => {
    l = JSON.parse(line);
    umap[l.username] = l.id;
  });
  rl.on('close', x => {
    bigFile(umap);
  });
  

} catch (e) {
  console.log(e)
}