const fs = require('fs');
const superagent = require('superagent');
const { getAuthToken } = require('./lib/login');
const argv = require('minimist')(process.argv.slice(2));
let ep = argv._[0];
delete argv._;
let dbug = process.env.DEBUG;

(async () => {
  try {
    if (!ep) throw(`Usage node get.js <end_point>`);
    const config = await getAuthToken(superagent);

    ep = ep.replace(/^_\//, '');
    ep = ep.replace(/__/g, '/');
    let url = `${config.okapi}/${ep}`;
    let headers = {
      'User-Agent': config.agent,
      'cookie': config.cookie,
      'x-okapi-tenant': config.tenant,
      'x-okapi-token': config.token,
      'accept': 'application/json' 
    };
    for (let k in argv) {
      let v = argv[k];
      headers[k] = v;
    }
    console.warn('GET', url);
    try {
      const res = await superagent
      .get(url)
      .set(headers);
      if (dbug) console.log(res);
      console.log(JSON.stringify(res.body, null, 2));
    } catch (e) {
      let msg = (dbug) ? e : `${e}`;
      console.log(msg);
    }
  } catch(e) {
      console.log(`${e}`);
  }
})();
