const fs = require('fs');
const path = require('path');
const parse = require('csv-parse/lib/sync');
const uuid = require('uuid/v5');
const superagent = require('superagent');
const usersFile = process.argv[2];
const csvFile = process.argv[3];

const ns = 'b1c087ae-d03e-4959-ad37-e97fc4cdf816';
const tenant = 'sul';

(async () => {
  try {
    if (csvFile === undefined) {
      throw('Usage: node sulFines.js <users_file> <feefines_csv_file>');
    }
    if (!fs.existsSync(csvFile)) {
      throw new Error('Can\'t find feefines file');
    }
    if (!fs.existsSync(usersFile)) {
      throw new Error('Can\'t find users file');
    }

    const config = JSON.parse(fs.readFileSync('../.okapi', { encoding: 'utf8' }));
    if (config.tenant !== tenant) throw new Error('There is a tenant mismatch. Run the authToken.js script with proper config!');
    
    let base = config.url;
    let token = config.token;

    let workDir = path.dirname(csvFile);

    const users = require(usersFile);
    delete require.cache[require.resolve(usersFile)];

    let bcmap = {};
    let uc = 0;
    console.log(`Loading users...`);
    users.users.forEach(u => {
      bcmap[u.barcode] = u.id;
      uc++;
    });
    console.log(`(${uc} user records read)`);

    let csv = fs.readFileSync(csvFile, { encoding: 'utf8'});
    csv = csv.replace(/^\uFEFF/, ''); // remove BOM

    const inRecs = parse(csv, {
      columns: true,
      skip_empty_lines: true
    });

    const files = {
      ac: 'accounts.jsonl',
      ff: 'feefineactions.jsonl'
    };

    for (let k in files) {
      files[k] = `${workDir}/${files[k]}`;
      if (fs.existsSync(files[k])) fs.unlinkSync(files[k]);
    }

    let total = 0;
    let succ = 0;
    let err = 0;
    const nowVal = new Date().valueOf();
    for (x = 0; x < inRecs.length; x++) {
      total++;
      let r = inRecs[x];
      let ubc = r.userID;
      let uid = bcmap[ubc];
      let ibc = r.itemID;
      let ti = r.title;
      let am = r.amount;
      let re = r.remaining;
      let ps = r.paymentStatus;
      if (uid) {
        // now that we have a user ID, let's see if we can't find the item ID
        let acc = {
          userId: uid,
          amount: am,
          remaining: re,
          paymentStatus: ps
        }
        try {
          
          let url = `${base}/item-storage/items?query=barcode==${ibc}`;
          let res = await superagent
            .get(url)
            .set('x-okapi-token', token)
            .set('accept', 'application/json');
          let item = (res.body && res.body.items) ? res.body.items[0] : '';
          let iid = (item) ? item.id : '';
          if (iid) {
            acc.itemId = iid;
          }
          else {
            acc.title = ti;
            console.log(`WARN Item records not found for barcode ${ibc}`);
          }
          console.log(acc);
        } catch (e) {
          console.log(e);
        }
        succ++
      } else {
        console.log(`ERROR User not for with barcode ${ubc}!`);
        err++;
      }
    }
    console.log('Total:', total);
    console.log('Success:', succ);
    console.log('Errors:', err);


  } catch (e) {
    console.error(e);
  }
})();
