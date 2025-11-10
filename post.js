const fs = require('fs');
const superagent = require('superagent');
const { getAuthToken } = require('./lib/login');
let ep = process.argv[2];

(async () => {
  try {
    if (!ep) throw(`Usage node post.js <end_point>`);
    const config = await getAuthToken(superagent);
    if (ep.match(/^_/)) {
      ep = ep.replace(/^../, '');
      ep = ep.replace(/__/g, '/');
    }
    let url = `${config.okapi}/${ep}`;
    console.warn('POST', url);
    try {
      const res = await superagent
      .post(url)
      .set('User-Agent', config.agent)
      .set('cookie', config.cookie)
      .set('x-okapi-tenant', config.tenant)
      .set('x-okapi-token', config.token)
      .set('accept', 'application/json');
      console.log(JSON.stringify(res.body, null, 2));
    } catch (e) {
      console.log(`${e}`);
    }
  } catch(e) {
      console.log(`${e}`);
  }
})();
