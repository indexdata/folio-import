const fs = require('fs');
const superagent = require('superagent');
const { getAuthToken } = require('./lib/login');
let ep = process.argv[2];

(async () => {
  try {
    if (!ep) throw(`Usage node get.js <end_point>`);
    const config = (fs.existsSync('./config.js')) ? require('./config.js') : require('./config.default.js');
    const authToken = await getAuthToken(superagent, config.okapi, config.tenant, config.authpath, config.username, config.password);

    if (ep.match(/^\.x/)) {
      ep = ep.replace(/^\.x\//, '');
      ep = ep.replace(/__/g, '/');
    }
    let url = `${config.okapi}/${ep}`;
    console.warn('GET', url);
    try {
      const res = await superagent
    .get(url)
    .set('x-okapi-token', authToken);
      console.log(JSON.stringify(res.body, null, 2));
    } catch (e) {
      console.log(`${e}`);
    }
  } catch(e) {
      console.log(`${e}`);
  }
})();
