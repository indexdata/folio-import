const fs = require('fs');
const superagent = require('superagent');
const { getAuthToken } = require('./lib/login');
let inFile = process.argv[2];

const wait = (ms) => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

(async () => {
  try {
    const start = new Date().valueOf();
    let inData;
    if (!inFile) {
      throw new Error('Usage: node loadServicePointsUsers.js <service_points_users_file> [ <limit> ]');
    } else if (!fs.existsSync(inFile)) {
      throw new Error('Can\'t find input file');
    } else {
      inData = require(inFile);
    }
    const config = (fs.existsSync('./config.js')) ? require('./config.js') : require('./config.default.js');

    let limit = (process.argv[3]) ? parseInt(process.argv[3], 10) : inData.length;

    if (isNaN(limit)) {
      throw new Error('Limit must be a number.');
    }

    const authToken = await getAuthToken(superagent, config.okapi, config.tenant, config.authpath, config.username, config.password);

    const actionUrl = config.okapi + '/service-points-users';
    
    let success = 0;
    let fail = 0;
    for (let x = 0; x < limit; x++) {
      let i = x + 1;
      try {
        await superagent
          .post(actionUrl)
          .send(inData[x])
          .set('x-okapi-token', authToken)
          .set('content-type', 'application/json')
          .set('accept', 'application/json');
        console.log(`${i} of ${limit} : Successfully added to userId ${inData[x].userId}`);
        success++
      } catch (e) {
        console.log(e.response.text);
        fail++;
      }
      await wait(config.delay);
    }
    const end = new Date().valueOf();
    const ms = end - start;
    const time = Math.floor(ms / 1000);
    console.log(`\nTime:          ${time} sec`);
    console.log(`Records added: ${success}`);
    console.log(`Failures:      ${fail}\n`);
  } catch (e) {
    console.log(e.message);
  }
})();
