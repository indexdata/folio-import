const fs = require('fs');
const readline = require('readline');
const path = require('path');
const uuid = require('uuid/v3');
const { prependListener } = require('process');

const ns = '65f4529e-1581-47f0-84a0-a5b63092e1b3';

let inFile = process.argv[2];

(async () => {
  try {
    const start = new Date().valueOf();
    if (!inFile) {
      throw 'Usage: node makeAccountLoans.js <accounts_jsonl>';
    } else if (!fs.existsSync(inFile)) {
      throw new Error('Can\'t find input file');
    } 

    const workingDir = path.dirname(inFile);
    const baseName = path.basename(inFile, '.jsonl');
    const apath = `${workingDir}/new-accounts.jsonl`;
    const dpath = `${workingDir}/loans.jsonl`;
    const found = `${workingDir}/found.jsonl`;
    if (fs.existsSync(apath)) {
      fs.unlinkSync(apath);
    }
    if (fs.existsSync(dpath)) {
      fs.unlinkSync(dpath);
    }
    if (fs.existsSync(found)) {
      fs.unlinkSync(found);
    }

    const hzFile = workingDir + '/hz-loans.jsonl';
    let hzLoans = {};
    const getHzLoans = async () => {
      const fileStream = fs.createReadStream(hzFile);

      const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
      });
      for await (const line of rl) {
        let rec = JSON.parse(line);
        let userId = uuid(rec['borrower#'].toString(), 'dfc59d30-cdad-3d03-9dee-d99117852eab');
        let key = userId + '|' + rec['item#'];
        hzLoans[key] = rec;
      }
    }
    console.log('Loading hz-loans...');
    await getHzLoans();

    const itemFile = workingDir + '/items.jsonl';
    let itemStatus = {};
    const getItems = async () => {
      const fileStream = fs.createReadStream(itemFile);

      const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
      });
      for await (const line of rl) {
        let rec = JSON.parse(line);
        let key = rec.id;
        itemStatus[key] = rec.status.name;
      }
    }
    console.log('Loading items...');
    await getItems();

    const getDateByDays = (days) => {
      const ms = days * 86400 * 1000;
      const rdate = new Date(ms).toISOString();
      return rdate;
    }
    
    const fileStream = fs.createReadStream(inFile);

    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });

    let x = 0;
    let y = 0;
    let l = 0;
    let f = 0;
    let seen = {};
    let procFee = {};
    for await (const line of rl) {
      l++;
      if (l % 10000 === 0) console.log('Lines processed:', l); 
      let acc = JSON.parse(line);
      let istat = itemStatus[acc.itemId];
      if (acc.status.name === "Open" && acc.title && acc.title.match(/hrid=/) && istat === 'Declared lost') {
        let lid = uuid(acc.userId + acc.itemId, ns);
        if (!procFee[lid]) {
          procFee[lid] = { count: 0, found: 0 };
        }
        let hrid = acc.title.replace(/.*?(\d+).*/, '$1');
        let hzLoan = hzLoans[acc.userId + '|' + hrid];
        let dueDate = (hzLoan) ? getDateByDays(hzLoan.due_date) : '2021-12-01T18:38:15.155Z';
        let loanDate = (hzLoan) ? getDateByDays(hzLoan.last_cko_date) : '2021-12-01T18:38:15.155Z';
        
        if (!seen[lid] && !acc.loanId ) {
          let dloan = {
            id: lid,
            itemId: acc.itemId,
            userId: acc.userId,
            action: 'declaredLost',
            loanDate: loanDate,
            loanPolicyId: 'd9cd0bed-1b49-4b5e-a7bd-064b8d177231',
            lostItemPolicyId: 'c7d3b34c-69e6-4aea-ae36-d3a7ccf97d20',
            overdueFinePolicyId: '4e41ca5f-c48a-4d04-b49c-a121d3ceaad9',
            dueDate: dueDate,
            declaredLostDate: dueDate,
            status: { name: 'Open' }
          }
          fs.writeFileSync(dpath, JSON.stringify(dloan) + '\n', { flag: 'a' });

          seen[lid] = 1;
          y++;
        }
        x++;
        if (!acc.loanId) acc.loanId = lid;
        if (procFee[lid].found === 0) {
          if (acc.amount === 5 || procFee[lid].count === 1) {
            acc.feeFineType = 'Lost item processing fee';
            procFee[lid].found++;
          }
        }
        fs.writeFileSync(apath, JSON.stringify(acc) + '\n', { flag: 'a' });
        procFee[lid].count++;
      } else if (acc.status.name === 'Open' && istat !== 'Declared lost') {
        fs.writeFileSync(found, JSON.stringify(acc) + '\n', { flag: 'a'})
        f++;
      }
    }
    console.log(`${l} accounts processed`);
    console.log(`${x} accounts changed and saved to ${apath}`);
    console.log(`${y} loans created and saved to ${dpath}`);
    console.log(`${f} accounts have found items, saved to ${found}`);
  } catch (e) {
    console.error(e);
  }
})();
