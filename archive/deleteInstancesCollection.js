const fs = require('fs');
const superagent = require('superagent');
const { getAuthToken } = require('./lib/login');
let inFile = process.argv[2];

const wait = (ms) => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

(async () => {
  try {
    let inData;
    if (!inFile) {
      throw new Error('Usage: node deleteInstancesBatch.js <instances_collection>');
    } else if (!fs.existsSync(inFile)) {
      throw new Error('Can\'t find input file');
    } else {
      try {
        inData = require(inFile);
      } catch (e) {
        inData = require(`./${inFile}`);
      }
    }
    const config = (fs.existsSync('./config.js')) ? require('./config.js') : require('./config.default.js');

    const authToken = await getAuthToken(superagent, config.okapi, config.tenant, config.authpath, config.username, config.password);

    const actionUrl = config.okapi + '/inventory/instances';

    for (let x = 0; x < inData.instances.length; x++) {
      let id = inData.instances[x].id;
      console.log(`[${x}] Deleting ${id} ${inData.instances[x].title}`);
      try {
        await superagent
          .delete(`${actionUrl}/${id}`)
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
