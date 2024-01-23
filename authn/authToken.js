const fs = require('fs');
const superagent = require('superagent');
const { getAuthToken } = require('./lib/login');
const okapi = '.okapi';

(async () => {
  const config = (fs.existsSync('./config.js')) ? require('./config.js') : require('./config.default.js');
  const authToken = await getAuthToken(superagent, config.okapi, config.tenant, config.authpath, config.username, config.password);
  const out = {
    url: config.okapi,
    tenant: config.tenant,
    token: authToken
  };
  fs.writeFileSync(okapi, JSON.stringify(out));
  console.log(out);
})();
