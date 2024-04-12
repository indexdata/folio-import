const getAuthToken = async (config, superagent) => {
  const authUrl = config.okapi + config.authpath;
  const authBody = `{"username": "${config.username}", "password": "${config.password}"}`;
  console.warn(`Sending credentials to ${authUrl}`);
  try {
    let res = await superagent
      .post(authUrl)
      .send(authBody)
      .set('x-okapi-tenant', config.tenant)
      .set('accept', 'application/json')
      .set('content-type', 'application/json');
   
    let at;
    if (res.headers && res.headers['set-cookie']) {
      for (let x = 0; x < res.headers['set-cookie'].length; x++) {
        let c = res.headers['set-cookie'][x];
        if (c.match(/^folioAccessToken/)) {
          at = c.replace(/^folioAccessToken=(.+?); .*/, '$1');
        }
      }
    }
    else if (res.headers && res.headers['x-okapi-token']) {
      at = res.headers['x-okapi-token'];
    }
    if (at) return at;
  } catch (e) {
    if (e.response) {
      console.log(e.response.text);
    } else {
      console.log(e);  
    }
  }
};

module.exports = { getAuthToken };
