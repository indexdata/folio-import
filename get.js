const fs = require('fs');
const superagent = require('superagent');
const { getAuthToken } = require('./lib/login');
let ep = process.argv[2];
let dbug = process.env.DEBUG;

(async () => {
  try {
    if (!ep) throw(`Usage node get.js <end_point>`);
    const config = await getAuthToken(superagent);

    ep = ep.replace(/^_\//, '');
    ep = ep.replace(/__/g, '/');
    let url = `${config.okapi}/${ep}`;
    console.warn('GET', url);
    try {
      const res = await superagent
      .get(url)
      .set('User-Agent', config.agent)
      .set('cookie', config.cookie)
      .set('x-okapi-tenant', config.tenant)
      .set('x-okapi-token', config.token)
      .set('accept', 'application/json');
      console.log(JSON.stringify(res.body, null, 2));
    } catch (e) {
      let msg = (dbug) ? e : `${e}`;
      console.log(msg);
    }
  } catch(e) {
      console.log(`${e}`);
  }
})();
