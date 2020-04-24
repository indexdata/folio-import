const fs = require('fs');
const superagent = require('superagent');
const { getAuthToken } = require('./lib/login');
const fn = process.argv[2];

(async () => {
  let added = 0;
  let updated = 0;
  let errors = 0;
  let deleted = 0;
  try {
    if (!fn) {
      throw new Error('Usage: node checkoutByBarcode.js <file>');
    }
    const config = (fs.existsSync('./config.js')) ? require('./config.js') : require('./config.default.js');

    const authToken = await getAuthToken(superagent, config.okapi, config.tenant, config.authpath, config.username, config.password);

    let collStr = fs.readFileSync(fn, 'utf8');
    let coll = JSON.parse(collStr);

    const url = `${config.okapi}/circulation/check-out-by-barcode`;
    let collRoot = 'checkouts';
    let data = coll[collRoot];

    for (d = 0; d < data.length; d++) {
      try {
        console.log(`[${added}] POST ${url}...`);
        let res = await superagent
          .post(url)
          .timeout({ response: 5000 })
          .set('accept', 'application/json', 'text/plain')
          .set('x-okapi-token', authToken)
          .set('content-type', 'application/json')
          .send(data[d]);
        added++;
      } catch (e) {
        console.log(e.response.error.text);
        /* try {
          if (process.argv[3] === 'DELETE' && e.response) throw new Error(e.response.text);
          if (process.argv[3] !== 'DELETE') {
            console.log(e.response.error);
            console.log(`  ${e} -- Trying PUT...`);
            let purl = url;
            purl += '/' + data[d].id;
            console.log(`  PUT ${purl}...`);
            let res = await superagent
              .put(purl)
              .timeout({ response: 5000 })
              .set('accept', 'text/plain')
              .set('x-okapi-token', authToken)
              .set('content-type', 'application/json')
              .send(data[d]);
            updated++;
          }
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
        */
       errors++;
      }
    } 
    console.log(`Added:   ${added}`);
    console.log(`Updated: ${updated}`);
    console.log(`Errors:  ${errors}`);
    console.log(`Deleted: ${deleted}`)
  } catch (e) {
    console.error(e.message);
  }
})();
