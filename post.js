const fs = require('fs');
const superagent = require('superagent');
const { getAuthToken } = require('./lib/login');
let ep = process.argv[2];
let pl = process.argv[3];

(async () => {
  try {
    if (!pl) throw(`Usage node post.js <end_point> <payload_file>`);
    const config = (fs.existsSync('./config.js')) ? require('./config.js') : require('./config.default.js');
    const authToken = await getAuthToken(superagent, config.okapi, config.tenant, config.authpath, config.username, config.password);

    if (ep.match(/^\.x/)) {
      ep = ep.replace(/^\.x\//, '');
      ep = ep.replace(/__/g, '/');
    }
    const payload = fs.readFileSync(pl, { encoding: 'utf8'});
    let url = `${config.okapi}/${ep}`;
    console.warn('POST', url);
    try {
      const res = await superagent
      .post(url)
      .send(payload)
      .set('content-type', 'application/json')
      .set('x-okapi-token', authToken);
      console.log(JSON.stringify(res.body, null, 2));
    } catch (e) {
      let msg = (e.response) ? e.response.text : e;
      console.log(msg);
    }
  } catch(e) {
      console.log(`${e}`);
  }
})();
