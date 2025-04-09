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

let finesFile = process.argv[2];

let servicePoint = 'ef95b899-be17-450a-bbf5-801c5fb04dbb'; // Pecan Library
let priceNote = '1fceb11c-7a89-49d6-8ef0-2a42c58556a2';
let feefineId = '0f0ce03e-dd66-4015-b553-600d5829e30f';
let feefineName = 'Damaged / Partially Lost Item';
let ownerId = '0931239d-6a6a-4aa1-aeb9-f0c63f4ecdba'; 
let ownerName = 'Library';
const ns = 'bb37432c-e13d-4d13-a151-eb4b7bc86ea6';

const inFiles = { 
  actCost: 'actual-costs.jsonl',
  items: 'items.jsonl',
  users: 'users.jsonl'
};

const outFiles = {
  bill: 'bills.jsonl',
  ad: 'actionDates.jsonl',
  acc: 'accounts.jsonl',
  ffa: 'feefineActions.jsonl'
};

(async () => {
  try {
    if (!finesFile) {
      throw('Usage: node stcFines.js <fines_csv_file>');
    }
    let finesDir = path.dirname(finesFile);
    const start = new Date().valueOf();

    for (let k in inFiles) {
      inFiles[k] = finesDir + '/' + inFiles[k];
    }
    inFiles.fines = finesFile;
    // throw(inFiles);

    for (let k in outFiles) {
      outFiles[k] = finesDir + '/' + outFiles[k];
      if (fs.existsSync(outFiles[k])) fs.unlinkSync(outFiles[k]);
    }
    // throw(outFiles);

    // map fines for csv file
    let csv = fs.readFileSync(inFiles.fines, {encoding: 'utf8'});
    const inRecs = parse(csv, {
      columns: true,
      skip_empty_lines: true,
      delimiter: '|',
      trim: true
    });
    let finesMap = {}
    inRecs.forEach(r => {
      let k = (r.ITEM_ID) ? 'ui' + r.ITEM_ID : r.BILL_KEYA + ':' + r.BILL_KEYB;
      finesMap[k] = { bal: r.BALANCE.replace(/(..)$/, '.$1'), rec: r };
    });
    // throw(finesMap);

    const users = {};
    let fileStream = fs.createReadStream(inFiles.users);
    let rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });
    for await (let line of rl) {
      let o = JSON.parse(line);
      let k = o.username;
      let v = o.id;
      users[k] = v;
    }
    // throw(users);

    let fseen = {};

    // map items
    const items = {};
    fileStream = fs.createReadStream(inFiles.items);
    rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });
    for await (let line of rl) {
      let o = JSON.parse(line);
      let k = o.id;
      let hrid = o.hrid;
      let hkey = hrid.replace(/^ui/, '');
      items[hkey] = o;
      if (o.status.name === 'Aged to lost') {
        let fine = finesMap[hrid];
        fseen[hrid] = fine;
        if (items[k]) {
          console.log(`WARN item "${hrid}" has already been billed!`);
        }
        let nts = o.notes;
        items[k] = {};
        if (fine) { 
          items[k].bal = fine.bal;
          let bd = (fine.rec.BILL_DATE) ? fine.rec.BILL_DATE.replace(/(....)(..)(..)/, '$1-$2-$3') : '';
          try {
            let billDate = new Date(bd).toISOString();
            finesMap[hrid].rec.bd = billDate;
            items[k].date = billDate;
          } catch (e) {
            console.log(`{e}`);
          }
        }
        if (nts) {
          nts.forEach(n => {
            if (n.itemNoteTypeId === priceNote) {
              items[k].amt = n.note;
            } 
          });
        };
      }
    }
    // throw(items);
    // throw(fseen);

    const writeOut = (file, obj) => {
      fs.writeFileSync(file, JSON.stringify(obj) + '\n', { flag: 'a'});
    };

    const ttl = {
      proc: 0,
      skips: 0,
      bills: 0,
      acounts: 0,
      ffa: 0,
      notLost: 0,        
      err: 0,
      acc: 0,
    }

    fileStream = fs.createReadStream(inFiles.actCost);
    rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });
    for await (let line of rl) {
      ttl.proc++;
      let r = JSON.parse(line);
      let aid = r.id;
      let iid = r.item.id;
      let item = items[iid];
      if (item && r.status === 'Open') {
        let o = {
          actualCostRecordId: aid,
          servicePointId: servicePoint
        }
        if (item.bal && item.bal !== item.amt) {
          o.amount = item.bal;
          o.additionalInfoForStaff = `This is the balance due. (Actual cost: $${item.amt})`;
        } else {
          o.amount = item.amt;
        }
        o.amount = parseFloat(o.amount);
        if (o.amount > 0) {
          writeOut(outFiles.bill, o);
          ttl.bills++;
          /* 
          if (item.date) {
            let a = { id: r.id, dateCreated: item.date };
            writeOut(outFiles.ad, a);
            ttl.acc++;
          }
          */
        } else {
          console.log(`WARN amount is $0 -- not billing (${iid})`);
          ttl.err++;
        }
      } else {
        // console.log('INFO actual cost status is not "Open"');
        ttl.skips++
      }

    }

    for (k in finesMap) {
      let fine = finesMap[k].rec;
      let bal = finesMap[k].bal;
      let reason = fine.BILL_REASON;
      let bdate = fine.BILL_DATE.replace(/(....)(..)(..)/, '$1-$2-$3T12:00:00-0500');
      let uid = users[fine.USERNAME];
      let item = items[fine.ITEM_ID];
      let iid = (item) ? item.id : '';
      if (!fseen[k] && reason !== 'PROCESSFEE') {
        let idKey = fine.BILL_KEYA + ':' + fine.BILL_KEYB;
        let amtStr = fine.AMOUNT.replace(/(..)$/, '.$1');
        let amt = parseFloat(amtStr);
        let a = {
          id: uuid(idKey, ns),
          amount: amt,
          remaining: parseFloat(bal),
          dateCreated: bdate,
          status: { name: 'Open' },
          paymentStatus: {},
          feeFineId: feefineId,
          feeFineType: feefineName,
          ownerId: ownerId,
          feeFineOwner: ownerName
        };
        a.paymentStatus.name = (a.amount > a.remaining) ? 'Paid partially' : 'Outstanding';
        a.userId = uid;
        if (item) {
          a.itemId = iid;
          a.barcode = item.barcode;
          a.materialTypeId = item.materialTypeId;
          if (item.effectiveCallNumberComponents) a.callNumber = item.effectiveCallNumberComponents.callNumber;
        }
        if (a.userId) {
          writeOut(outFiles.acc, a);
          ttl.acounts++;

          let ffa = {
            id: uuid(a.id, ns),
            accountId: a.id,
            userId: a.userId,
            dateAction: bdate,
            typeAction: 'Manual charge',
            amountAction: a.remaining,
            balance: a.remaining,
            comments: JSON.stringify(fine)
          }
          writeOut(outFiles.ffa, ffa);
          ttl.ffa++;
        } else {
          console.log(`ERROR account missing userId!`);
        }
      } else if (uid && iid && bdate) {
        let o = {
          iid: iid,
          uid: uid,
          date: bdate
        }
        writeOut(outFiles.ad, o);
        ttl.acc++;
        console.log(o);
      }
    }

    const end = new Date().valueOf();
    const time = (end - start)/1000;
    console.log('AC recs processed:', ttl.proc);
    console.log('Skipped', ttl.skips);
    console.log('Bills:', ttl.bills);
    console.log('Accounts:', ttl.acounts);
    console.log('FeefineActions:', ttl.ffa);
    console.log('Account createDates:', ttl.acc);
    console.log('Not aged to lost:', ttl.notLost);
    console.log('Total errors:', ttl.err);
    console.log('Time (sec):', time);
  } catch (e) {
    console.error(e);
  }
})();
