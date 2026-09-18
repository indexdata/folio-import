const fs = require('fs');
const path = require('path');
const readline = require('readline');

const inFile = process.argv[2];
const folFile = process.argv[3];
const udate = process.argv[4] || new Date().toISOString().replace(/T.+/, '');

(async () => {
  try {
    if (!folFile) throw('Usage: node compUserImport <user_import_file> <folio_users_jsonl> [ <update_date> ]');
    
    const dir = path.dirname(inFile);
    const ext = path.extname(inFile);
    const base = path.basename(inFile, ext);
    const outFile = `${dir}/${base}_failed.jsonl`;
    if (fs.existsSync(outFile)) fs.unlinkSync(outFile);

    let fileStream = fs.createReadStream(folFile);
    let rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });

    let c = 0;
    let m = 0;
    let nf = 0;
    let fol = {};
    let dre = new RegExp('^' + udate);
    console.log('Reading file:', folFile);
    for await (const line of rl) {
      c++;
      let j = JSON.parse(line);
      if (j.metadata.updatedDate && j.metadata.updatedDate.match(dre)) {
        let un = j.username;
        fol[un] = j;
        m++;
      }
    }
    console.log(`Folio users read: ${c}`);
    console.log(`Folio users updated on ${udate}: ${m}`);
    
    console.log(`Parsing import file at: ${inFile}`);
    let uiObj = require(inFile);
    let unames = [];
    uiObj.users.forEach(u => {
      let un = u.username;
      if (!fol[un]) {
        unames.push(un);
        let ustr = JSON.stringify(u);
        fs.writeFileSync(outFile, ustr + '\n', { flag: 'a' });
        nf++;
      }
    });
    console.log(`Users not updated (${nf})`);
    if (nf > 0) {
      console.log('-----------------------------');
      unames.sort().forEach(u => {
        console.log(u);
      });
    }
  } catch (e) {
    console.error(e)
  }
})();