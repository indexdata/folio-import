const fs = require('fs');
const superagent = require('superagent');
const { getAuthToken } = require('./lib/login');
const okapi = '.okapi';

(async () => {
  const config = await getAuthToken(superagent);
  const out = {
    url: config.okapi,
    tenant: config.tenant,
    token: config.token
  };
  if (config.expiry) {
    out.expiry = config.expiry;
  }
  fs.writeFileSync(okapi, JSON.stringify(out));
  console.log(out);
})();
