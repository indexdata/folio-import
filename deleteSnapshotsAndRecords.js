/*
  Download up to 1000 snapshots and delete each (and associated records) by id
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
    const endpoint = 'source-storage/snapshots';
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

    console.log(`Deleting ${refData.totalRecords} snapshots...`);
    for (let x = 0; x < refData.snapshots.length; x++) {
      let id = refData.snapshots[x].jobExecutionId;
      console.log(`Deleting ${id}`);
      try {
        await superagent
          .delete(`${config.okapi}/source-storage/snapshots/${id}`)
          .set('accept', 'text/plain')
          .set('x-okapi-tenant', config.tenant)
          .set('x-okapi-token', authToken);
      } catch (e) {
        console.error(e.response || e);
      }
      await wait(config.delay);
    }
  } catch (e) {
    console.error(e.message);
  }
})();
