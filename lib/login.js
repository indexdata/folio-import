const getAuthToken = async (superagent, okapi, tenant, path, username, password) => {
  const authUrl = okapi + path;
  const authBody = `{"username": "${username}", "password": "${password}"}`;
  console.log(`Sending credentials to ${authUrl}`);
  try {
    let res = await superagent
      .post(authUrl)
      .send(authBody)
      .set('x-okapi-tenant', tenant)
      .set('accept', 'application/json')
      .set('content-type', 'application/json');
    return res.headers['x-okapi-token'];
  } catch (e) {
    if (e.response) {
      console.log(e.response.text);
    } else {
      console.log(e);  
    }
  }
};

module.exports = { getAuthToken };
