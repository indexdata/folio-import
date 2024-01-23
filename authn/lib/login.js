const getAuthToken = async (superagent, okapi, tenant, path, username, password, everything) => {
  const authUrl = okapi + path;
  const authBody = `{"username": "${username}", "password": "${password}"}`;
  if (process.env.OKAPI_TOKEN) {
    console.log('Using stored okapi-token-- skipping login...');
    return process.env.OKAPI_TOKEN
  }
  console.warn(`Sending credentials to ${authUrl}`);
  try {
    let res = await superagent
      .post(authUrl)
      .send(authBody)
      .set('x-okapi-tenant', tenant)
      .set('accept', 'application/json')
      .set('content-type', 'application/json');
    if (everything) {
      return res;
    } else {
      let at = '';
      if (res.headers && res.headers['set-cookie']) {
        for (let x = 0; x < res.headers['set-cookie'].length; x++) {
          let c = res.headers['set-cookie'][x];
          if (c.match(/^folioAccessToken/)) {
            at = c;
          }
        }
      }
      // return res.headers['set-cookie'];
      return at;
    }
  } catch (e) {
    if (e.response) {
      console.log(e.response.text);
    } else {
      console.log(e);  
    }
  }
};

module.exports = { getAuthToken };
