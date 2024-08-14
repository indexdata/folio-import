const fs = require('fs');
const path = require('path');
const readline = require('readline');
const uuid = require('uuid/v5');

const permsFile = process.argv[2];
const usersFile = process.argv[3];

const ns = '32b5c76c-6ba5-4f52-96aa-9f425dc7c085';

(async () => {
  try {
    if (!usersFile) throw('Usage: node usersNoPerms.js <perms_users_file_jsonl> <users_file_jsonl>');
    
    const dir = path.dirname(usersFile);
    const fn = path.basename(usersFile, '.jsonl');
    const outFile = `${dir}/${fn}-add-perms.jsonl`;
    const noPermsFile = `${dir}/${fn}-no-perms.jsonl`;
    if (fs.existsSync(outFile)) fs.unlinkSync(outFile);
    if (fs.existsSync(noPermsFile)) fs.unlinkSync(noPermsFile);

    let fileStream = fs.createReadStream(permsFile);
    let rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });

    let c = 0;
    let puMap = {};
    console.log('Reading file:', permsFile);
    for await (const line of rl) {
      c++;
      let j = JSON.parse(line);
      puMap[j.userId] = j;
      if (c%10000 === 0) console.log('Lines read:', c);
    }
    console.log('Total lines read:', c);

    fileStream = fs.createReadStream(usersFile);
    rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });

    c = 0;
    let puc = 0;
    let npc = 0;
    console.log('Reading file:', usersFile);
    for await (const line of rl) {
      c++;
      let j = JSON.parse(line);
      if (!puMap[j.id]) {
        // console.log('INFO perms/users object not found.', j.id);
	let pu = {
		id: uuid(j.id, ns),
		userId: j.id,
		permissions: []
	}
        fs.writeFileSync(outFile, JSON.stringify(pu) + '\n', { flag: 'a' });
	puc++
      } else if (puMap[j.id] && (!puMap[j.id].permissions || !puMap[j.id].permissions[0])) {
        fs.writeFileSync(noPermsFile, line + '\n', { flag: 'a' });
	npc++;
      }
      if (c%10000 === 0) console.log('Lines read:', c);
    }
    console.log('Total lines read:', c);
    console.log('Perms/users created', puc);
    console.log('Users no perms', npc);
  } catch (e) {
    console.error(e)
  }
})();
