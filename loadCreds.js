const fs = require('fs');
const superagent = require('superagent');
const { getAuthToken } = require('./lib/login');

const inFile = process.argv[2];
const offset = process.argv[3] ? parseInt(process.argv[3], 10) : 0;
if (isNaN(offset)) throw new Error(`Limit must be a number!`);

const wait = (ms) => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

(async () => {
  var creds;
  try {
    const start = new Date().valueOf();
    if (!inFile) {
      throw new Error('Usage: node loadCreds.js <credentials_file> [ start ]');
    } else if (!fs.existsSync(inFile)) {
      throw new Error('Can\'t find input file');
    } else {
      creds = require(inFile);
    }
    const config = (fs.existsSync('./config.js')) ? require('./config.js') : require('./config.default.js');

    const credUrl = config.okapi + '/authn/credentials';
    
    const authToken = await getAuthToken(superagent, config.okapi, config.tenant, config.authpath, config.username, config.password);

    let success = 0;
    let fail = 0;
    for (let x = offset; x < creds.length; x++) {
      const usersUrl = `${config.okapi}/users/${creds[x].userId}`;
      console.log(x);
      let i = x + 1;
      try {
        /* await superagent
          .get(usersUrl)
          .set('x-okapi-token', authToken)
          .set('accept', 'application/json'); */
        try {
          let res = await superagent
            .post(credUrl)
            .send(creds[x])
            .set('x-okapi-token', authToken)
            .set('content-type', 'application/json')
            .set('accept', 'application/json');
          console.log(`${i} of ${creds.length} : Successfully added to userId ${creds[x].userId}`);
          success++;
        } catch (e) {
          console.log(e.message);
          fail++;
        }
      } catch (e) {
        console.log(e.message);
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
    console.error(e.message);
  }
})();
