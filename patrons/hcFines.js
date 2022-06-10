const readline = require('readline');
const fs = require('fs');
const path = require('path');
const uuid = require('uuid/v5');
const { getAuthToken } = require('../lib/login');
const superagent = require('superagent');

const ns = '829f760a-09ac-4e68-a1fa-688cf1fe7d7c';
const owner = '88f3a68d-8982-4a0d-b893-851eef69ae7e';
const fineType = '8b27811a-0bb7-4088-a865-8373cb88cef4';
const createdAt = '3a40852d-49fd-4df2-a1f9-6e2641a6e91f';
const source = 'Sierra';
const stypes = { 
  itemCharge: '',
  processingFee: 'Lost item processing fee',
  billingFee: 'Lost item billing fee'
}

const usersFile = process.argv[2];
const mapFile = process.argv[3];
const inFile = process.argv[4];


(async () => {
  try {
    if (!inFile) throw 'Usage: node hcFines.js <folio_users_file> <id_to_username_map> <sierra_fines_file>';
    if (!fs.existsSync(inFile)) throw `Can't find fines file: ${inFile}!`;
    if (!fs.existsSync(mapFile)) throw `Can't find map file directory: ${mapFile}!`;
    if (!fs.existsSync(usersFile)) throw `Can't find map file directory: ${usersFile}!`;
    const saveDir = path.dirname(inFile);
    const outPath = `${saveDir}/folio-accounts.jsonl`;
    const actPath = `${saveDir}/folio-actions.jsonl`; 
    if (fs.existsSync(outPath)) fs.unlinkSync(outPath);
    if (fs.existsSync(actPath)) fs.unlinkSync(actPath);


    const config = require('../config.js');

    const authToken = await getAuthToken(superagent, config.okapi, config.tenant, config.authpath, config.username, config.password);

    const start = new Date().valueOf();
    let count = 0;
    let succ = 0;
    let err = 0;

    // map users
    console.log('Loading users...');
    let users = require(usersFile);
    let folioUsersMap = {};
    users.users.forEach(u => {
      let k = u.username;
      folioUsersMap[k] = u.id;
    });
    delete require.cache[require.resolve(usersFile)];
    users = {};

    // map sierra patron id to folio users
    console.log('Mapping users...');
    let ids = require(mapFile);
    const idMap = {};
    for (let k in ids) {
      let un = ids[k];
      idMap[k] = folioUsersMap[un];
    }
    delete require.cache[require.resolve(mapFile)];
    ids = {};
    folioUsersMap = {};

    const calcCheckDigit = (recordNumber) => {
      let m = 2
      let x = 0
      let i = Number(recordNumber)
      while (i > 0) {
        let a = i % 10
        i = Math.floor(i / 10)
        x += a * m
        m += 1
      }
      const r = x % 11
      return r === 10 ? 'x' : String(r)
    }

    let fileStream = fs.createReadStream(inFile);
    let rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });
    for await (const l of rl) {
      let f = JSON.parse(l);
      let pid = f.patron.replace(/^.+\//, '');
      let userId = idMap[pid];

      if (userId) {
        let acc = {};
        let hrid = f.item.replace(/.+\//, '');
        let check = calcCheckDigit(hrid);
        hrid = 'i' + hrid + check;
        let item = {};
        let url = `${config.okapi}/inventory/items?query=hrid==${hrid}`;
        console.log(`GET ${url}`);
        try {
          let res = await superagent
            .get(url)
            .set('x-okapi-token', authToken);
          item = res.body.items[0];
        } catch (e) {
          console.log(e);
        }

        for (let stype in stypes) {
          if (f[stype] > 0) {
            acc.id = uuid(f.id + stype, ns);
            acc.userId = userId;
            acc.ownerId = owner;
            acc.feeFineOwner = 'Dinand Library';
            acc.feeFineId = fineType;
            acc.feeFineType = stypes[stype] || f.chargeType.display;
            acc.amount = f[stype];
            acc.remaining = acc.amount;
            acc.dateCreated = f.assessedDate;
            acc.status = { name: 'Open' };
            acc.paymentStatus = { name: 'Outstanding' };
            if (item) {
              acc.title = item.title;
              acc.contributors = item.contributorNames;
              acc.barcode = item.barcode;
              acc.callNumber = item.callNumber;
              acc.location = item.effectiveLocation.name;
              acc.itemStatus = item.status;
              acc.materialType = item.materialType.name;
              acc.itemId = item.id;
              acc.holdingsRecordId = item.holdingsRecordId;
            }
            // acc.contributors = [ ];

            let accStr = JSON.stringify(acc) + '\n';
            fs.writeFileSync(outPath, accStr, { flag: 'a'});
            console.log(acc);
          }
        }
      } else {
        console.log(`WARN userId not found for ${pid}`);
      }
      count++;
    }
    
    let tt = (new Date().valueOf() - start) / 1000;
    console.log('Done', count);
    console.log('Seconds', tt);


  } catch (e) {
    console.log(e);
  }
})();