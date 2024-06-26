const getAuthToken = async (superagent) => {
  const fs = require('fs');
  const config = (fs.existsSync('../config.js')) ? require('../config.js') : require('../config.default.js');
  const authUrl = config.okapi + config.authpath;
  const authBody = { username: config.username, password: config.password };
  console.warn(`Sending credentials to ${authUrl}`);
  const out = {
    okapi: config.okapi,
    tenant: config.tenant,
    logpath: config.logpath
  };
  try {
    let res = await superagent
      .post(authUrl)
      .send(authBody)
      .set('x-okapi-tenant', config.tenant)
      .set('accept', 'application/json')
      .set('content-type', 'application/json');
    let at;
    let exp;
    let expVal;
    if (res.headers && res.headers['set-cookie']) {
      for (let x = 0; x < res.headers['set-cookie'].length; x++) {
        let c = res.headers['set-cookie'][x];
        if (c.match(/^folioAccessToken/)) {
          at = c.replace(/^folioAccessToken=(.+?); .*/, '$1');
          exp = c.replace(/.+Expires=(.+?);.*/, '$1');
          expVal = new Date(exp).valueOf() - 5000;
        }
      }
    }
    else if (res.headers && res.headers['x-okapi-token']) {
      at = res.headers['x-okapi-token'];
    }
    if (at) { 
      out.token = at;
      out.expiry = expVal;
    }
    return out;
  } catch (e) {
    if (e.response) {
      throw new Error(e.response.text);
    } else {
      throw new Error(e);
    }
  }
};

module.exports = { getAuthToken };
