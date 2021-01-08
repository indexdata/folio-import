const fs = require('fs');
const superagent = require('superagent');
const { getAuthToken } = require('./lib/login');
const path = require('path');
const fn = process.argv[2]; 

(async () => {
  let added = 0;
  let errors = 0;
  let errRecs = { requests: [] };
  try {
    if (!fn) {
      throw new Error('Usage: node loadRequests.js <file>');
    }
    if (!fs.existsSync(fn)) {
      throw new Error('Can\'t find input file!');
    }

    const config = (fs.existsSync('./config.js')) ? require('./config.js') : require('./config.default.js');

    const authToken = await getAuthToken(superagent, config.okapi, config.tenant, config.authpath, config.username, config.password);
    
    let url = `${config.okapi}/circulation/requests`;
    let coll = require(fn);
    for (d = 0; d < coll.requests.length; d++) {
      let request = coll.requests[d];
      try {
        console.log(`[${d}] POST ${url} (${request.id})`);
        let res = await superagent
          .post(url)
          .set('accept', 'application/json', 'text/plain')
          .set('x-okapi-token', authToken)
          .set('content-type', 'application/json')
          .send(request);
        added++;
      } catch (e) {
          console.log(e.response.res.text);
          errors++;
          errRecs.requests.push(request);
      }
    } 
    console.log(`Added:   ${added}`);
    console.log(`Errors:  ${errors}`);

    if (errors > 0) {
      const wd = path.dirname(fn);
      const outPath = `${wd}/requests_errors.json`;
      console.log(`Writing error records to ${outPath}`);
      fs.writeFileSync(outPath, JSON.stringify(errRecs, null, 2));
    }
  } catch (e) {
    console.error(e.message);
  }
})();
