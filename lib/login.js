const getAuthToken = async (superagent, everything) => {
  const fs = require('fs');
  let config;
  try {
    config = require('../config.json');
  } catch (e) {
    try {
      config = require('./config.json');
    } catch (e) {
      config = require('../config.default.json');
    }
  }
  const authUrl = config.okapi + config.authpath;
  const authBody = { username: config.username, password: config.password };
  console.warn(`Sending credentials to ${authUrl}`);
  const out = {};
  for (let k in config) {
    out[k] = config[k];
  }
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
    if (res && res.headers && res.headers['set-cookie']) {
      for (let x = 0; x < res.headers['set-cookie'].length; x++) {
        let c = res.headers['set-cookie'][x];
        if (c.match(/^folioAccessToken/)) {
          at = c.replace(/^folioAccessToken=(.+?); .*/, '$1');
          exp = c.replace(/.+Expires=(.+?);.*/, '$1');
          expVal = new Date(exp).valueOf() - 5000;
        }
      }
    }
    else if (res && res.headers && res.headers['x-okapi-token']) {
      at = res.headers['x-okapi-token'];
    }
    if (at) { 
      out.token = at;
      out.expiry = expVal;
    }
    if (everything) {
      out.res = res.body;
    }
    return out;
  } catch (e) {
    if (e.response) {
      throw new Error(e.response.text);
    } else if (e.errors) {
      throw new Error(e.errors);
    } else {
      throw new Error(e);
    }
  }
};

module.exports = { getAuthToken };
