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
    if (!ep) throw(`Usage node get-test.js <end_point>`);
    let config = await getAuthToken(superagent);

    if (ep.match(/^\.x/)) {
      ep = ep.replace(/^\.x\//, '');
      ep = ep.replace(/__/g, '/');
    }
    let url = `${config.okapi}/${ep}`;

    for (x = 0; x<100; x++) {
      let out = await req(url, config.token);
      console.log('Rep', x, out.totalRecords);
      let now = new Date().valueOf();
      await wait(60000);
      if (now >= config.expiry) {
        config = await getAuthToken(superagent);
      }
    }
  } catch(e) {
      console.log(`${e}`);
  }
})();
