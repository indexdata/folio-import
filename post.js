const fs = require('fs');
const superagent = require('superagent');
const { getAuthToken } = require('./lib/login');
let ep = process.argv[2];
let file = process.argv[3];
let dbug = process.env.DEBUG;

(async () => {
  try {
    if (!ep) throw(`Usage node post.js <end_point> [<file>]`);
    const config = await getAuthToken(superagent);
    if (ep.match(/^_/)) {
      ep = ep.replace(/^../, '');
      ep = ep.replace(/__/g, '/');
    }
    let pl = ''
    if (file) {
      pl = fs.readFileSync(file, { encoding: 'utf8' });
    }
    let url = `${config.okapi}/${ep}`;
    console.warn('POST', url);
    try {
      const res = await superagent
      .post(url)
      .send(pl)
      .set('Content-type', 'text/xml')
      .set('User-Agent', config.agent)
      .set('cookie', config.cookie)
      .set('x-okapi-tenant', config.tenant)
      .set('x-okapi-token', config.token)
      .set('accept', 'application/json');
      console.log(JSON.stringify(res.body, null, 2));
      console.log(res.text);
    } catch (e) {
      let msg = (dbug) ? e : `${e}`;
      console.log(msg);
    }
  } catch(e) {
      let msg = (dbug) ? e : `${e}`;
      console.log(msg);
  }
})();
