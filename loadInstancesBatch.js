const fs = require('fs');
const superagent = require('superagent');
const { getAuthToken } = require('./lib/login');
let inFile = process.argv[2];

/*
const wait = (ms) => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};
*/

(async () => {
  try {
    let inData;
    if (!inFile) {
      throw new Error('Usage: node loadInstancesBatch.js <instances_batch_file>');
    } else if (!fs.existsSync(inFile)) {
      throw new Error('Can\'t find input file');
    } else {
      inData = require(inFile);
    }
    const config = (fs.existsSync('./config.js')) ? require('./config.js') : require('./config.default.js');

    const authToken = await getAuthToken(superagent, config.okapi, config.tenant, config.authpath, config.username, config.password);

    const actionUrl = config.okapi + '/inventory/instances/batch';

    try {
      res = await superagent
        .post(actionUrl)
        .send(inData)
        .set('x-okapi-tenant', config.tenant)
        .set('x-okapi-token', authToken)
        .set('content-type', 'application/json');
      const mesg = JSON.parse(res.text);
      console.log(JSON.stringify(mesg, null, 2));
    } catch (e) {
      const mesg = JSON.parse(e.response.text);
      console.error(JSON.stringify(mesg, null, 2));
    }
  } catch (e) {
    console.error(e.message);
  }
})();
