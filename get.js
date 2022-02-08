const fs = require('fs');
const superagent = require('superagent');
const { getAuthToken } = require('./lib/login');
let ep = process.argv[2];

(async () => {
  const config = (fs.existsSync('./config.js')) ? require('./config.js') : require('./config.default.js');
  const authToken = await getAuthToken(superagent, config.okapi, config.tenant, config.authpath, config.username, config.password);
  let url = `${config.okapi}/${ep}`;
  console.log('GET', url);
  try {
    const res = await superagent
	.get(url)
	.set('x-okapi-token', authToken);
    console.log(JSON.stringify(res.body, null, 2));
  } catch (e) {
    console.log(`${e}`);
  }
})();
