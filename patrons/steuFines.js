const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');
const readline = require('readline');
let uuid;
try {
  uuid = require('uuid/v5');
} catch (e) {
  const { v5 } = require('uuid');
  uuid = v5;
}

let inFile = process.argv[2];

const inFiles = {
  user: 'users.jsonl',
  item: 'items.jsonl',
  ff: 'feefines.jsonl'
};

const outFiles = {
  a: 'accounts.jsonl',
  f: 'feefineactions.jsonl'
};

const ns = '2a884f05-46db-493c-acf6-b31502064dd8';
const spId = '640eb43c-924f-4ecd-aa36-a0a76f535142';
const ownerId = 'fbf186d6-583d-4687-a698-2a091b8f7be9'; // Mahoney Library

(async () => {
  try {
    if (!inFile) {
      throw('Usage: node steuFines.js <fines_csv_file>');
    }
    let dir = path.dirname(inFile);
    const start = new Date().valueOf();

    for (let k in inFiles) {
      inFiles[k] = dir + '/' + inFiles[k];
    }
    inFiles.fines = inFile;
    // throw(inFiles);

    for (let k in outFiles) {
      outFiles[k] = dir + '/' + outFiles[k];
      if (fs.existsSync(outFiles[k])) fs.unlinkSync(outFiles[k]);
    }
    // throw(outFiles);

    const ffMap = {};
    let ffData = fs.readFileSync(inFiles.ff, { encoding: 'utf8' });
    ffData.split(/\n/).forEach(l => {
      if (l) {
        let j = JSON.parse(l);
        let k = j.feeFineType.toLowerCase();
        ffMap[k] = j.id;
      }
    });
    // throw(ffMap);

    // map users
    let fileStream = fs.createReadStream(inFiles.user);
    let rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });
    const users = {};
    for await (let line of rl) {
      let o = JSON.parse(line);
      let k = o.barcode;
      if (k) {
        users[k] = o.id;
      }
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
      let k = o.barcode;
      items[k] = o.id;
    }
    // throw(items);
    
    const parseDate = (dstr, type) => {
      let dt = '';
      let dto = new Date(dstr);
      try {
        let dzo = (dto.getTimezoneOffset() - 60)/60;
	      if (dzo < 0) dzo = 6 + dzo
        let pto = `-0${dzo}:00`;
        dt = dto.toISOString();
        dt = (type === 'due') ? dt.replace(/T.+/, `T23:59:59.000${pto}`) : dt.replace(/T.+/, `T12:00:00.000${pto}`);
      } catch (e) {
        console.log(`${e} : ${dstr}`);
      }
      return(dt);
    }

    const writeOut = (file, obj) => {
      fs.writeFileSync(file, JSON.stringify(obj) + '\n', { flag: 'a'});
    };

    const ttl = {
      proc: 0,
      a: 0,
      f: 0,
      unf: 0,
      err: 0
    }

    let csv = fs.readFileSync(inFiles.fines, {encoding: 'utf8'});
    const inRecs = parse(csv, {
      columns: true,
      skip_empty_lines: true,
      delimiter: ',',
      trime: true,
      bom: true
    });

    inRecs.forEach(rr => {
      let r = {};
      for (kk in rr) {
        k = kk.replace(/\W+/g, '_').toLowerCase();
        r[k] = (k.match(/title|reason/)) ? rr[kk].replace(/\n/sg, ' ') : rr[kk].replace(/\n/sg, '');
      }
      ttl.proc++;
      if (process.env.DEBUG) console.log(r);
      let ibc = r['patron_barcode'];
      let itemId = items[ibc];
      let ubc = r['patron_barcode'].replace(/\n/gs, '');
      let userId = users[ubc] || users['0000' + ubc] || users['000' + ubc];
      if (!userId) {
        console.log(`ERROR no user found with barcode "${ubc}" (${r.patron_family_name}, ${r.patron_given_name})`);
        ttl.unf++;
        ttl.err++;
      } else {
        let amt = parseFloat(r.fiscal_transaction_amount);
        let ramt = parseFloat(r.fiscal_transaction_outstanding_amount);
        let pst = (amt === ramt) ? 'Outstanding' : 'Paid partially';
        let reason = r['fiscal_bill_reason'].toLowerCase();
        let ffid = ffMap[reason];
        let idStr = `${ttl.proc}`;
        let a = {
          id: uuid(idStr, ns),
          userId: userId,
          ownerId: ownerId,
          amount: amt,
          remaining: ramt,
          status: { name: 'Open' },
          paymentStatus: { name: pst },
          feeFineId: ffid,
          feeFineType: r['fiscal_bill_reason'],
          dateCreated: r['fiscal_transaction_date_time'].substring(0, 10) + 'T16:00:00',
          feeFineOwner: 'Mahoney Library'
        };
        if (itemId) a.itemId = itemId;
        if (r.item_title && !r.item_title.match(/N\/A/)) a.title = r.item_title;
        if (r.item_barcode && !r.item_barcode.match(/N\/A/)) a.barcode = r.item_barcode;
        if (process.env.DEBUG) console.log(a);
        writeOut(outFiles.a, a);
        ttl.a++;

        // create feefineaction
        let f = {
          id: uuid(a.id, ns),
          accountId: a.id,
          dateAction: a.dateCreated,
          amountAction: a.amount,
          balance: a.remaining,
          createdAt: spId,
          userId: a.userId,
          typeAction: ''
        }
        if (process.env.DEBUG) console.log(f);
        writeOut(outFiles.f, f);
        ttl.f++;
      }
    });

    const end = new Date().valueOf();
    const time = (end - start)/1000;
    console.log('-------------------------------');
    console.log('Processed:', ttl.proc);
    console.log('Accounts:', ttl.a);
    console.log('Actions:', ttl.f);
    console.log('Users not found:', ttl.unf);
    console.log('Total errors:', ttl.err);
    console.log('Time (sec):', time);
  } catch (e) {
    console.error(e);
  }
})();
