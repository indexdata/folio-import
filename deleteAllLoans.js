const fs = require('fs');
const superagent = require('superagent');
const { getAuthToken } = require('./lib/login');

let ten = process.argv[2];
const ep = 'loan-storage/loans';

const wait = (ms) => {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

(async () => {
  try {
    if (!ten) throw('Usage: node deleteAllLoans.js <tenant>');
    let config = await getAuthToken(superagent);
    if (ten !== config.tenant) throw new Error(`Tenant "${ten}" does not match current config "${config.tenant}"`)
    
    let url = `${config.okapi}/${ep}`;
    console.log('DELETE', url);
    try {
      const res = await superagent
        .delete(url)
        .set('User-Agent', config.agent)
        .set('cookie', config.cookie)
        .set('x-okapi-tenant', config.tenant)
        .set('x-okapi-token', config.token)
        console.log('HTTP status:', res.status);
    } catch (e) {
      console.log(e);
    }
  } catch (e) {
    console.log(`${e}`);
  }
})();
