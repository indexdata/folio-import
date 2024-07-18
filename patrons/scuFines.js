const readline = require('readline');
const fs = require('fs');
const path = require('path');
const uuid = require('uuid/v5');
const superagent = require('superagent');

const tenant = 'scu';
const ns = '48f413f1-ef56-44fb-a665-7df0e1813be3';
const owner = 'ee5ecb79-e879-47b4-9082-f9cd27a7eaa3';
const ownerName = 'Default';
const createdAt = 'b298ad5b-8d55-568d-baf4-a8d0f722182f';
const lawCreatedAt = 'ade69b4d-cd52-587b-b20a-d5dd0f8bb090';

const source = 'Sierra';
const stypes = { 
  itemCharge: {
    name: 'Overdue fine',
    id: '9523cb96-e752-40c2-89da-60f3961a488d'
  },
  processingFee: {
    name: 'Lost item processing fee',
    id: 'c7dede15-aa48-45ed-860b-f996540180e0'
  },
  lostItemFee: {
    name: 'Lost item fee',
    id: 'cf238f9f-7018-47b7-b815-bb2db798e19f'
  },
  replacementFee: {
    name: 'Replacement processing fee',
    id: 'd20df2fb-45fd-4184-b238-0d25747ffdd9'
  },
  billingFee: {
    name: 'Lost item billing fee',
    id: '96cfc7a1-3cfd-4b4e-b436-c75c2d0825f1'
  }
};

const ctypes = {
  '1': 1,
  '2': 1,
  '4': 1,
  '6': 1,
};

const usersFile = process.argv[2];
const inFile = process.argv[3];


(async () => {
  try {
    if (!inFile) throw 'Usage: node scuFines.js <folio_users_jsonl> <sierra_fines_jsonl>';
    if (!fs.existsSync(inFile)) throw `Can't find fines file: ${inFile}!`;
    if (!fs.existsSync(usersFile)) throw `Can't find map file directory: ${usersFile}!`;
    const saveDir = path.dirname(inFile);
    const outPath = `${saveDir}/folio-accounts.jsonl`;
    const actPath = `${saveDir}/folio-actions.jsonl`; 
    const payPath = `${saveDir}/folio-pay.jsonl`; 
    if (fs.existsSync(outPath)) fs.unlinkSync(outPath);
    if (fs.existsSync(actPath)) fs.unlinkSync(actPath);
    if (fs.existsSync(payPath)) fs.unlinkSync(payPath);

    const config = JSON.parse(fs.readFileSync('../.okapi', { encoding: 'utf8' }));
    if (config.tenant !== tenant) throw new Error('There is a tenant mismatch. Run the authToken.js script with proper config!');
    const authToken = config.token;

    const start = new Date().valueOf();
    let count = 0;
    let accCount = 0;
    let ffaCount = 0;
    let payCount = 0;
    let errCount = 0;
    let skipCount = 0;

    // map users
    console.log('Loading users...');
    let fileStream = fs.createReadStream(usersFile);
    let rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });
    const userMap = {};
    for await (const line of rl) {
      let u = JSON.parse(line);
      if (u.customFields) {
        let pid = u.customFields.sierraPatronRecordNumber.replace(/^p/, '');
        userMap[pid] = u.id;
      }
    }
    // console.log(userMap); return;

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

    fileStream = fs.createReadStream(inFile);
    rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });
    for await (const l of rl) {
      let f = JSON.parse(l);
      let ctype = f.chargeType.code;
      let pid = f.patron.replace(/^.+\//, '');
      let userId = userMap[pid];
      let invNum = (f.invoiceNumber) ? f.invoiceNumber.toString() : '';
      let comm = 'Invoice number: ' + invNum;
      let rdate = f.returnDate;

      if (userId && ctypes[ctype]) {
        let acc = {};
        let hrid = '';
        let item = {};
        if (f.item) {
          hrid = f.item.replace(/.+\/(\d+).*/, '$1');
          hrid = 'i' + hrid;
        
          let url = `${config.url}/inventory/items?query=hrid==${hrid}`;
          console.log(`[${count}] GET ${url}`);
          try {
            let res = await superagent
              .get(url)
              .set('x-okapi-token', authToken);
            item = res.body.items[0];
            if (!item) console.log(`WARN No item found for ${hrid}`);
          } catch (e) {
            console.log(e);
          }
        }

        let paid = false;
        for (let stype in stypes) {
          if (f[stype] > 0) {
            acc.id = uuid(f.id + stype, ns);
            acc.userId = userId;
            acc.ownerId = owner;
            acc.feeFineOwner = ownerName;
            if (stypes[stype]) {
              if (stype === 'itemCharge' && f.chargeType.code === '3') {
                acc.feeFineType = stypes.lostItemFee.name;
                acc.feeFineId = stypes.lostItemFee.id;
              } else {
                acc.feeFineType = stypes[stype].name;
                acc.feeFineId = stypes[stype].id;
              }
            } else {
              acc.feeFineType = f.chargeType.display;
              acc.feeFineId = fineType.lostItemFee.id;
            }
            acc.amount = f[stype];
            acc.remaining = acc.amount;
            /* if (f.paidAmount > 0 && !payMade) {
              acc.remaining -= f.paidAmount;
              payMade = true;
            } */
            acc.dateCreated = f.assessedDate;
            acc.status = { name: 'Open' };
            acc.paymentStatus = { name: 'Outstanding' };
            if (rdate) acc.returnedDate = rdate;
            if (item && item.id) {
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

            let ffa = {};
            ffa.id = uuid(acc.id, ns);
            ffa.accountId = acc.id;
            ffa.userId = acc.userId;
            ffa.dateAction = acc.dateCreated;
            ffa.typeAction = acc.feeFineType;
            ffa.notify = false;
            ffa.amountAction = acc.amount;
            ffa.balance = acc.remaining;
            ffa.comments = comm;
            /* if (ffa.amountAction > ffa.balance) {
              ffa.typeAction = 'Paid partially'
              ffa.paymentMethod = 'Cash'
            } */
            ffa.createdAt = createdAt;
            ffa.source = source;
            /* if (f.description) {
              ffa.comments = f.description;
            }*/

            let accStr = JSON.stringify(acc) + '\n';
            fs.writeFileSync(outPath, accStr, { flag: 'a'});
            accCount++;

            let ffaStr = JSON.stringify(ffa) + '\n';
            fs.writeFileSync(actPath, ffaStr, { flag: 'a' });
            ffaCount++;

            let pa = f.paidAmount;
            if (pa > 0 && !paid) {
              let payObj = {
                _accountId: acc.id,
                amount: pa,
                paymentMethod: 'Other',
                notifyPatron: false,
                comments: comm,
                servicePointId: '3a40852d-49fd-4df2-a1f9-6e2641a6e91f',
                userName: source,
                transactionInfo: ''
              }
              let payStr = JSON.stringify(payObj) + '\n';
              fs.writeFileSync(payPath, payStr, { flag: 'a' });
              payCount++;
              paid = true;
            }
          }
        }
      } else {
        if (ctypes[ctype]) {
          console.log(`WARN userId not found for ${pid}`);
          errCount++;
        } else {
          console.log(`INFO skipping fineId ${f.id}. Reason: chargeType is ${ctype}`);
          skipCount++;
        }
      }
      count++;
    }
    
    let tt = (new Date().valueOf() - start) / 1000;
    console.log('Processed', count);
    console.log('Accounts', accCount);
    console.log('Actions', ffaCount);
    console.log('Payments', payCount);
    console.log('Skips', skipCount);
    console.log('Errors', errCount);
    console.log('Seconds', tt);


  } catch (e) {
    console.log(e);
  }
})();