const fs = require('fs');
const superagent = require('superagent');
const { getAuthToken } = require('./lib/login');
const okapi = '.okapi';

(async () => {
  const config = await getAuthToken(superagent);
  let authToken = config.token;
  const out = {
    url: config.okapi,
    tenant: config.tenant,
    token: authToken
  };
  if (config.expiry) { 
    out.expiry = config.expiry;
  }
  fs.writeFileSync(okapi, JSON.stringify(out));
  console.log(out);
})();
