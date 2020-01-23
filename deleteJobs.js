/*
  Download up to 1000 records from an okapi endpoint and delete each by id
*/

const fs = require('fs');
const superagent = require('superagent');
const { getAuthToken } = require('./lib/login');
let anything = process.argv[2];

if (!anything) {
  throw new Error('This script will delete all SRS records. You must provide an argument (anything)');
}

const wait = (ms) => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

(async () => {
  try {
    let inData;

    const config = (fs.existsSync('./config.js')) ? require('./config.js') : require('./config.default.js');

    const authToken = await getAuthToken(superagent, config.okapi, config.tenant, config.authpath, config.username, config.password);
    const endpoint = 'metadata-provider/jobExecutions';
    const getUrl = config.okapi + '/' + endpoint + '?limit=1000';
    let refData;

    try {
      const res = await superagent
        .get(getUrl)
        .set('accept', 'application/json')
        .set('x-okapi-tenant', config.tenant)
        .set('x-okapi-token', authToken); 
      refData = res.body;
    } catch (e) {
      console.log(e);
    }
    
    console.log(`Deleting ${refData.totalRecords} job executions...`);
    for (let x = 0; x < refData.jobExecutions.length; x++) {
      let id = refData.jobExecutions[x].id;
      console.log(`Deleting ${id}`);
      try {
        await superagent
          .delete(`${config.okapi}/change-manager/jobExecutions/${id}/records`)
          .set('accept', 'text/plain')
          .set('x-okapi-tenant', config.tenant)
          .set('x-okapi-token', authToken);
      } catch (e) {
        console.error(e.response.text);
      }
      await wait(config.delay);
    }
  } catch (e) {
    console.error(e.message);
  }
})();
