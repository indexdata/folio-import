/*
  Delete instance-types by instanceTypes reference collection file.
*/

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
      throw new Error('Usage: node deleteInstanceTypes.js <instance_type_file>');
    } else if (!fs.existsSync(inFile)) {
      throw new Error('Can\'t find input file');
    } else {
      try {
        inData = require(inFile);
      } catch (e) {
        inData = require(`./${inFile}`); 
      }
      if (inData.instanceTypes) {
        inData = inData.instanceTypes;
      }
    }
    const config = (fs.existsSync('./config.js')) ? require('./config.js') : require('./config.default.js');

    const authToken = await getAuthToken(superagent, config.okapi, config.tenant, config.authpath, config.username, config.password);

    const actionUrl = config.okapi + '/instance-types';

    for (let x = 0; x < inData.length; x++) {
      let id = inData[x].id;
      console.log(`Deleting ${id}`);
      try {
        await superagent
          .delete(`${actionUrl}/${id}`)
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
