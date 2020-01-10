/*
  Download up to 1000 records from an okapi endpoint and delete each by id
*/

const fs = require('fs');
const superagent = require('superagent');
const { getAuthToken } = require('./lib/login');
let endpoint = process.argv[2];

const wait = (ms) => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

(async () => {
  try {
    let inData;
    if (!endpoint) {
      throw new Error('Usage: node deleteRefDataByEndpoint.js <endpoint>');
    }

    const config = (fs.existsSync('./config.js')) ? require('./config.js') : require('./config.default.js');

    const authToken = await getAuthToken(superagent, config.okapi, config.tenant, config.authpath, config.username, config.password);

    endpoint = endpoint.replace(/^\//, '');
    const getUrl = config.okapi + '/' + endpoint + '?limit=1000';
    const deleteUrl = config.okapi + '/' + endpoint;
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
    let root;
    const firstLevel = Object.keys(refData);
    firstLevel.forEach(l => {
      if (l !== 'totalRecords') {
        root = l;
      }
    });
    console.log(`Deleting ${refData.totalRecords} ${root}...`);
    for (let x = 0; x < refData[root].length; x++) {
      let id = refData[root][x].id;
      console.log(`Deleting ${id}`);
      try {
        await superagent
          .delete(`${deleteUrl}/${id}`)
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
