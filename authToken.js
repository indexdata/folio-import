const fs = require('fs');
const superagent = require('superagent');
const { getAuthToken } = require('./lib/login');
const okapi = '.okapi';

(async () => {
  const config = await getAuthToken(superagent, process.env.DEBUG);
  let out = {
    url: config.okapi,
    tenant: config.tenant,
    token: config.token
  };
  if (config.expiry) {
    out.expiry = config.expiry;
  }
  if (config.cookie) {
    out.cookie = config.cookie;
  }
  fs.writeFileSync(okapi, JSON.stringify(out));
  if (process.env.DEBUG) out = JSON.stringify(config, null, 2);
  console.log(out);
})();
