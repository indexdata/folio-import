const fs = require('fs');
const path = require('path');
const parse = require('csv-parse/lib/sync');
const readline = require('readline');

let circDir = process.argv[2];

const inFiles = {
  circ: 'CIRC_TRANSACTIONS.csv',
  sp: 'service-points.json',
  item: 'items.jsonl',
  user: 'users.jsonl'
};

const outFiles = {
  co: 'checkouts.jsonl',
  ia: 'inactive-checkouts.jsonl'
};

(async () => {
  try {
    if (!circDir) {
      throw('Usage: node pemCheckouts.js <circ_dir>');
    }
    circDir = circDir.replace(/\/$/, '');
    const start = new Date().valueOf();

    for (let k in inFiles) {
      inFiles[k] = circDir + '/' + inFiles[k];
    }
    // throw(inFiles);

    for (let k in outFiles) {
      outFiles[k] = circDir + '/' + outFiles[k];
      if (fs.existsSync(outFiles[k])) fs.unlinkSync(outFiles[k]);
    }
    // throw(outFiles);

    const sp = require(inFiles.sp);
    spMap = {};
    sp.servicepoints.forEach(s => {
      spMap[s.code] = s.id;
    });
    // throw(spMap);

    // map users
    let fileStream = fs.createReadStream(inFiles.user);
    let rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });
    const users = {};
    for await (let line of rl) {
      let o = JSON.parse(line);
      let k = o.__;
      users[k] = { bc: o.barcode, active: o.active, un: o.username, ex: o.expirationDate || '' };
    }
    // throw(users);

    // map items
    const items = {};
    fileStream = fs.createReadStream(inFiles.item);
    rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });
    for await (let line of rl) {
      let o = JSON.parse(line);
      let k = o.hrid.replace(/^[a-z]+/, '');
      items[k] = { bc: o.barcode, st: o.status.name };
    }
    // throw(items);
    
    const dateOffset = (dt) => {
      let dzo = new Date(dt).getTimezoneOffset();
      let pto = ((dzo+120)/60);  // change this value according to the local machine that runs the script.
      out = `-0${pto}:00`;
      return out; 
    }

    const writeOut = (file, obj) => {
      fs.writeFileSync(file, JSON.stringify(obj) + '\n', { flag: 'a'});
    };

    const records = {};
    const ttl = {
      co: 0,
      ia: 0,
      unf: 0,
      inf: 0,
      ina: 0,
    }

    let csv = fs.readFileSync(inFiles.circ, {encoding: 'utf8'});
    const inRecs = parse(csv, {
      columns: true,
      skip_empty_lines: true
    });

    inRecs.forEach(r => {
      let loan = {};
      let iid = r.ITEM_ID;
      let pid = r.PATRON_ID;
      let item = items[iid];
      let user = users[pid];
      if (!user) {
        console.log(`ERROR no user found for PATRON_ID ${pid}`);
        ttl.unf++;
      } else if (!item) {
        console.log(`ERROR no item found for ITEM_ID ${iid}`);
        ttl.inf++;
      } else if (item.st !== 'Available') {
        console.log(`ERROR item status for barcode ${item.bc} is not available`);
        ttl.ina++
      } else {
        loan.itemBarcode = item.bc;
        loan.userBarcode = user.bc;
        loan.username = user.un;
        let ld = r.CHARGE_DATE;
        let ldate = new Date(ld);
        loan.loanDate = (ldate) ? ldate.toISOString() : '';
        let dd = r.CURRENT_DUE_DATE || r.CHARGE_DUE_DATE;
        let ddate = new Date(dd);
        loan.dueDate = (ddate) ? ddate.toISOString() : '';
        loan.servicePointId = spMap.readingroom;
        if (r.RENEWAL_COUNT) loan.renewalCount = parseInt(r.RENEWAL_COUNT, 10);
        writeOut(outFiles.co, loan);
        ttl.co++;
        if (!user.active) {
          writeOut(outFiles.ia, loan);
          ttl.ia++;
        }
      }
    });

    const end = new Date().valueOf();
    const time = (end - start)/1000;
    console.log('Checkouts:', ttl.co);
    console.log('Inactives:', ttl.ia);
    console.log('Users not found:', ttl.unf);
    console.log('Items not found:', ttl.inf);
    console.log('Items not available:', ttl.ina);
    console.log('Time (sec):', time);
  } catch (e) {
    console.error(e);
  }
})();
