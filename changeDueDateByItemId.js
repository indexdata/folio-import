/*
  This script will take a file of item ids and a due date, then find a matching loan record.
  If it finds a loan record, it will post the due date to /circulation/loans/{id}/change-due-date
*/

const fs = require('fs');
const superagent = require('superagent');
const { getAuthToken } = require('./lib/login');
const readline = require('readline');

let dueDate = process.argv[2];
let inFile = process.argv[3];

(async () => {
  try {
    if (!inFile) {
      throw new Error('Usage: node changeDueDateByItemId.js <due date (eg. 2021-02-28T23:59:59-0500)> <file of item ids>');
    } else if (!fs.existsSync(inFile)) {
      throw new Error('Can\'t find data file');
    } else if (!dueDate.match(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d[+-]\d{4}/)) {
      throw new Error('Bad due date format!');
    }
    const payload = { dueDate: dueDate };
    
    const config = (fs.existsSync('./config.js')) ? require('./config.js') : require('./config.default.js');

    const authToken = await getAuthToken(superagent, config.okapi, config.tenant, config.authpath, config.username, config.password);

    const fileStream = fs.createReadStream(inFile);

    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });

    let x = 0;
    for await (let id of rl) {
      x++;
      let url = `${config.okapi}/circulation/loans?query=itemId==${id}`;
      console.log(`# ${x} GET loan ${url}`);
      try {
        let res = await superagent
          .get(url)
          .set('x-okapi-token', authToken)
          .set('accept', 'application/json');
        let loan = res.body;
        if (loan.totalRecords === 1) {
          let loanId = loan.loans[0].id;
          try {
            let purl = `${config.okapi}/circulation/loans/${loanId}/change-due-date`;
            console.log(`  POST ${purl} (${loan.loans[0].userId})`)
            let res = await superagent
              .post(purl)
              .send(payload)
              .set('x-okapi-token', authToken)
              .set('content-type', 'application/json')
              .set('accept', 'application/json');
          } catch (e) {
            console.log(e.response || e);
          }
        }
      } catch (e) {
        console.log(e.response || e);
      } 
    } 
  } catch (e) {
    console.log(e.message);
  }
})();
