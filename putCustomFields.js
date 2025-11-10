const fs = require('fs');
const superagent = require('superagent');
const { getAuthToken } = require('./lib/login');
const fn = process.argv[3]; 
const mod = process.argv[2];

(async () => {
  let added = 0;
  let updated = 0;
  let errors = 0;
  try {
    if (!fn) {
      throw new Error('Usage: node putCustomFields.js <mod-users version> <file>\nNOTE: Module set to ' + mod);
    }

    let config = await getAuthToken(superagent);
    let url = `${config.okapi}/custom-fields`;
    let collStr = fs.readFileSync(fn, 'utf8');
    if (!collStr.match(/customFields/)) {
      throw new Error('Payload object must contain a "customFields" array property!');
    }
    let coll = JSON.parse(collStr);
    delete coll.totalRecords;
    console.log(`PUT ${url}...`);
    try {
      let res = await superagent
        .put(url)
        .set('User-Agent', config.agent)
        .set('cookie', config.cookie)
        .set('x-okapi-tenant', config.tenant)
        .set('x-okapi-token', config.token)
        .set('content-type', 'application/json')
        .set('accept', 'text/plain')
	      .set('x-okapi-module-id', mod)
        .send(coll);
      updated++;
    } catch (e) {
      let msg;
      let err1 = e;
      try {
        msg = e.response.res.text;
      } catch (e) {
        msg = err1.message;
      }
      if (process.env.DEBUG) {
        console.log(e);
      } else {
        console.log(`ERROR: ${msg}`);
      }
      errors++;
    }
    console.log(`Added:   ${added}`);
    console.log(`Updated: ${updated}`);
    console.log(`Errors:  ${errors}`);
  } catch (e) {
    console.log(e.message);
  }
})();
