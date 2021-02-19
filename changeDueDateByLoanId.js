/*
  This script will take a file of loan ids and a due date and posts said due data to /circulation/loans/{id}/change-due-date.
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
      throw new Error('Usage: node changeDueDateByLoanId.js <due date (eg. 2021-02-28T23:59:59-0500)> <file of loan ids>');
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
    for await (let loanId of rl) {
      x++;
      console.log(loanId);
      try {
        let purl = `${config.okapi}/circulation/loans/${loanId}/change-due-date`;
        console.log(`[${x}]  POST ${purl}`)
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
    console.log(e.message);
  }
})();
