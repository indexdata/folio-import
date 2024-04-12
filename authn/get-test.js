const fs = require('fs');
const superagent = require('superagent');
const { getAuthToken } = require('./lib/login');
let ep = process.argv[2];

const wait = (ms) => {
  console.log('Waiting:', ms, 'ms');
  return new Promise((resolve) => setTimeout(resolve, ms));
};

const req = async (url, authToken) => {
    console.warn('GET', url);
    try {
      const res = await superagent
      .get(url)
      .set('x-okapi-token', authToken)
      .set('accept', 'application/json');
      return res.body;
    } catch (e) {
      console.log(`${e}`);
    }
}

(async () => {
  try {
    if (!ep) throw(`Usage node get.js <end_point>`);
    const config = (fs.existsSync('./config.js')) ? require('./config.js') : require('./config.default.js');
    let authToken = await getAuthToken(config, superagent);
    let authExpiry = new Date().valueOf() + (60 * 10 * 1000);

    if (ep.match(/^\.x/)) {
      ep = ep.replace(/^\.x\//, '');
      ep = ep.replace(/__/g, '/');
    }
    let url = `${config.okapi}/${ep}`;

    for (x = 0; x<100; x++) {
      let out = await req(url, authToken);
      console.log('Rep', x, out.totalRecords);
      let now = new Date().valueOf();
      await wait(60000);
      if (now >= authExpiry) {
        authToken = await getAuthToken(config, superagent);
        authExpiry = new Date().valueOf() + (60 * 10 * 1000);
      }
    }

    
  } catch(e) {
      console.log(`${e}`);
  }
})();
