const fs = require('fs');
const readline = require('readline');
const path = require('path');
const uuid = require('uuid/v5');

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
    const lpath = `${workingDir}/loans.jsonl`;
    if (fs.existsSync(apath)) {
      fs.unlinkSync(apath);
    }
    if (fs.existsSync(lpath)) {
      fs.unlinkSync(lpath);
    }
    
    const fileStream = fs.createReadStream(inFile);

    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });

    let x = 0;
    let y = 0;
    let seen = {};
    for await (const line of rl) {
      let acc = JSON.parse(line);
      let lid = uuid (acc.userId + acc.itemId, ns);
      if (!seen[lid]) {
        let loan = {
          id: lid,
          itemId: acc.itemId,
          userId: acc.userId,
          action: 'declaredLost',
          loanDate: '2021-01-01T12:00:00Z',
          loanPolicyId: 'd9cd0bed-1b49-4b5e-a7bd-064b8d177231',
          lostItemPolicyId: 'c7d3b34c-69e6-4aea-ae36-d3a7ccf97d20',
          overdueFinePolicyId: '4e41ca5f-c48a-4d04-b49c-a121d3ceaad9'
        }
        seen[lid] = 1;
        y++;
        fs.writeFileSync(lpath, JSON.stringify(loan) + '\n', { flag: 'a' });
      }
      x++;
      acc.loanId = lid;
      fs.writeFileSync(apath, JSON.stringify(acc) + '\n', { flag: 'a' });
    }
    console.log(`${x} account records processed and saved to ${apath}`);
    console.log(`${y} loans created and saved to ${lpath}`);
  } catch (e) {
    console.error(e);
  }
})();
