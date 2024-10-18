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
	  for (let x = 0; x < coll.customFields.length; x++) {
		let rec = coll.customFields[x];
    		console.log(`POST ${url}...`);
    		try {
      			let res = await superagent
        			.post(url)
        			.set('accept', 'text/plain')
        			.set('x-okapi-token', config.token)
        			.set('content-type', 'application/json')
				.set('x-okapi-module-id', mod)
        			.send(rec);
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
	}
    console.log(`Added:   ${updated}`);
    console.log(`Errors:  ${errors}`);
  } catch (e) {
    console.log(e.message);
  }
})();
