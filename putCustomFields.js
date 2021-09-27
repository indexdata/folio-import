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
    const config = (fs.existsSync('./config.js')) ? require('./config.js') : require('./config.default.js');

    const authToken = await getAuthToken(superagent, config.okapi, config.tenant, config.authpath, config.username, config.password);
    let url = `${config.okapi}/custom-fields`;
    let collStr = fs.readFileSync(fn, 'utf8');
    if (!collStr.match(/customFields/)) {
      throw new Error('Payload object must contain a "customFields" array property!');
    }
    console.log(`PUT ${url}...`);
    try {
      let res = await superagent
        .put(url)
        .set('accept', 'text/plain')
        .set('x-okapi-token', authToken)
        .set('content-type', 'application/json')
	.set('x-okapi-module-id', mod)
        .send(collStr);
      updated++;
    } catch (e) {
      let msg;
      let err1 = e;
      try {
        msg = e.response.res.text;
      } catch (e) {
        msg = err1.message;
      }
      console.log(`ERROR: ${msg}`);
      errors++;
    }
    console.log(`Added:   ${added}`);
    console.log(`Updated: ${updated}`);
    console.log(`Errors:  ${errors}`);
  } catch (e) {
    console.log(e.message);
  }
})();
