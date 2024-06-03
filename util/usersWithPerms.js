const fs = require('fs');
const path = require('path');
const readline = require('readline');

const inFile = process.argv[2];
const permsFile = process.argv[3];

(async () => {
  try {
    if (!permsFile) throw('Usage: node compJSONL.js <users_jsonl_file> <perms-users_jsonl_file>');
    
    const dir = path.dirname(inFile);
    const fn = path.basename(inFile, '.jsonl');
    const pfn = path.basename(permsFile, '.jsonl');
    const outFile = `${dir}/${fn}-with-perms.jsonl`;
    const outPerms = `${dir}/${pfn}-with-users.jsonl`;
    if (fs.existsSync(outFile)) fs.unlinkSync(outFile);
    if (fs.existsSync(outPerms)) fs.unlinkSync(outPerms);

    let fileStream = fs.createReadStream(permsFile);
    let rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });

    let c = 0
    let permsMap = {};
    console.log('Reading file:', permsFile);
    for await (const line of rl) {
      c++;
      let j = JSON.parse(line);
      permsMap[j.userId] = j;
    }
    console.log('Total perms/users lines read:', c);
    // console.log(permsMap); return;

    fileStream = fs.createReadStream(inFile);
    rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });

    c = 0;
    f = 0;
    console.log('Reading file:', inFile);
    for await (const line of rl) {
      c++;
      let j = JSON.parse(line);
      let pu = permsMap[j.id];
      if (j.username && !j.username.match(/admin|pubsub|^mod-|^data-export|^system-user/) && pu && pu.permissions[0]) {
        fs.writeFileSync(outFile, JSON.stringify(j) + '\n', { flag: 'a' });
        fs.writeFileSync(outPerms, JSON.stringify(pu) + '\n', { flag: 'a' })
        f++
      }
    }
    console.log('Total users read:', c);
    console.log('Matches found:', f);
  } catch (e) {
    console.error(e)
  }
})();
