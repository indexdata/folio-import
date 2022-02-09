const fs = require('fs');
const superagent = require('superagent');
const { getAuthToken } = require('./lib/login');

let ep = process.argv[2];
let delay = 3000;

const wait = (ms) => {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

(async () => {
  try {
    if (!ep) throw('Usage: node delete.js <end_point>');
    const config = (fs.existsSync('./config.js')) ? require('./config.js') : require('./config.default.js');
    const authToken = await getAuthToken(superagent, config.okapi, config.tenant, config.authpath, config.username, config.password);

    if (ep.match(/^\.x/)) {
      ep = ep.replace(/^\.x\//, '');
      ep = ep.replace(/__/g, '/');
    }
    let url = `${config.okapi}/${ep}`;
    console.warn('DELETE', url);
    console.warn(`Waiting ${delay} ms...`);
    await wait(delay);
    console.log('Resuming...');
    try {
      const res = await superagent
        .delete(url)
        .set('x-okapi-token', authToken);
        console.log('HTTP status:', res.status);
    } catch (e) {
      console.log(`${e}`);
    }
  } catch (e) {
    console.log(`${e}`);
  }
})();
