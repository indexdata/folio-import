const fs = require('fs');
const path = require('path');
const parse = require('csv-parse/lib/sync');
const uuid = require('uuid/v5');
const superagent = require('superagent');
let sharedDir = process.argv[2];
const csvFile = process.argv[3];

const ns = 'b1c087ae-d03e-4959-ad37-e97fc4cdf816';
const tenant = 'sul';

(async () => {
  try {
    if (csvFile === undefined) {
      throw('Usage: node sulFines.js <shared_dir> <feefines_csv_file>');
    }
    if (!fs.existsSync(csvFile)) {
      throw new Error('Can\'t find feefines file');
    }
    if (!fs.existsSync(sharedDir)) {
      throw new Error('Can\'t find users file');
    }

    const config = JSON.parse(fs.readFileSync('../.okapi', { encoding: 'utf8' }));
    if (config.tenant !== tenant) throw new Error('There is a tenant mismatch. Run the authToken.js script with proper config!');
    
    let base = config.url;
    let token = config.token;

    let workDir = path.dirname(csvFile);
    sharedDir = sharedDir.replace(/\/$/, '');

    const usersFile = sharedDir + '/' + 'users.json';
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

    const ffFile = sharedDir + '/' + 'feefines.json';
    const ff = require(ffFile);
    ffmap = {};
    ff.feefines.forEach(f => {
      let k = f.feeFineType.toLowerCase();
      ffmap[k] = { id: f.id, type: f.feeFineType };
    });

    const ofile = sharedDir + '/' + 'owners.json';
    const owners = require(ofile);
    omap = {};
    owners.owners.forEach(o => {
      let k = o.owner.toLowerCase();
      omap[k] = { id: o.id, owner: o.owner };
    });
    // console.log(omap); return;

    const writeObj = (fileName, data) => {
      fs.writeFileSync(fileName, JSON.stringify(data) + '\n', { flag: 'a' });
    };

    let csv = fs.readFileSync(csvFile, { encoding: 'utf8'});
    csv = csv.replace(/^\uFEFF/, ''); // remove BOM

    const inRecs = parse(csv, {
      columns: true,
      skip_empty_lines: true
    });

    const files = {
      ac: 'accounts.jsonl',
      ff: 'feefineactions.jsonl',
      nf: 'user-not-found.jsonl'
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
      let dc = r.dateCreated;
      dc = dc.replace(/(\d{4})(..)(..)/, '$1-$2-$3T00:00:00.000-12:00');
      let ft = r.feeFinetype.toLowerCase();
      let fft = ffmap[ft] || {};
      let owner = r.feeFineOwner.toLowerCase();
      let own = omap[owner] || {};

      if (uid) {
        // now that we have a user ID, let's see if we can't find the item ID
        let acc = {
          userId: uid,
          amount: am,
          remaining: re,
          paymentStatus: { name: ps },
          feeFineId: fft.id,
          feeFineType: fft.type,
          ownerId: own.id,
          feeFineOwner: own.owner, 
          status: { name: 'Open' }
        }
        acc.dateCreated = dc;
        try {
          let url = `${base}/inventory/items?query=barcode==${ibc}`;
          let res = await superagent
            .get(url)
            .set('x-okapi-token', token)
            .set('accept', 'application/json');
          let item = (res.body && res.body.items) ? res.body.items[0] : '';
          let iid = (item) ? item.id : '';
          if (iid) {
            acc.itemId = iid;
            acc.id = uuid(uid + iid + fft + am, ns);
            acc.title = item.title;
            acc.callNumber = item.callNumber;
            acc.barcode = item.barcode;
            acc.materialType = item.materialType.name;
            acc.materialTypeId = item.materialType.id;
            acc.itemStatus = { name: item.status.name};
            acc.location = item.permanentLocation.name;
            acc.holdingsRecordId = item.holdingsRecordId;
            if (item.contributorNames) acc.contributors = item.contributorNames;
          }
          else {
            acc.title = ti;
            acc.id = uuid(uid + ti + fft + am, ns);
            console.log(`WARN Item record not found for barcode ${ibc}`);
          }
          writeObj(files.ac, acc);
          if (process.env.DEBUG) console.log(acc);

          // make feefine actions
          let ffa = {
            id: uuid(acc.id, ns),
            accountId: acc.id,
            userId: uid,
            dateAction: dc,
            amountAction: acc.amount,
            balance: acc.remaining,
            typeAction: acc.feeFineType,
            comments: 'Migrated action'
          }
          writeObj(files.ff, ffa);
          if (process.env.DEBUG) console.log(ffa);
        } catch (e) {
          console.log(e);
        }
        succ++
      } else {
        console.log(`ERROR User not for with barcode ${ubc}!`);
        writeObj(files.nf, r);
        err++;
      }
    if (total % 100 === 0) console.log('Records processed:', total);
    }
    console.log('Total:', total);
    console.log('Success:', succ);
    console.log('Errors:', err);


  } catch (e) {
    console.error(e);
  }
})();
