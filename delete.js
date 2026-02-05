const fs = require('fs');
const superagent = require('superagent');
const { getAuthToken } = require('./lib/login');

let ep = process.argv[2];

const wait = (ms) => {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

(async () => {
  try {
    if (!ep) throw('Usage: node delete.js <end_point>');
    let config = await getAuthToken(superagent);

    if (ep.match(/^\.x/)) {
      ep = ep.replace(/^\.x\//, '');
      ep = ep.replace(/__/g, '/');
    }
    let url = `${config.okapi}/${ep}`;
    console.warn('DELETE', url);
    try {
      const res = await superagent
        .delete(url)
        .set('User-Agent', config.agent)
        .set('x-okapi-token', config.token);
        console.log('HTTP status:', res.status);
    } catch (e) {
      let msg = (process.env.DEBUG) ? e : `${e}`;
      console.log(msg);
    }
  } catch (e) {
    console.log(`${e}`);
  }
})();
