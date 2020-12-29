const fs = require('fs');
const superagent = require('superagent');
const { getAuthToken } = require('./lib/login');
const path = process.argv[2];
const fn = process.argv[3]; 

(async () => {
  let added = 0;
  let updated = 0;
  let errors = 0;
  try {
    if (!fn) {
      throw new Error('Usage: node loadByEndpoint.js <endpoint> <file>');
    }
    const config = (fs.existsSync('./config.js')) ? require('./config.js') : require('./config.default.js');

    const authToken = await getAuthToken(superagent, config.okapi, config.tenant, config.authpath, config.username, config.password);
    
    let url = `${config.okapi}/${path}`;
    let collStr = fs.readFileSync(fn, 'utf8');
    let coll = JSON.parse(collStr);
    let collKeys = Object.keys(coll).filter(f => { 
      if (f.match(/resultInfo|totalRecords/)) { 
        return false;
      } else {
        return true;
      }
    });
    let data = [];
    if (Array.isArray(coll[collKeys[0]])) {
      data = coll[collKeys[0]];
    } else {
      data.push(coll);
    }
    for (d = 0; d < data.length; d++) {
      try {
        console.log(`POST ${url}...`);
        let res = await superagent
          .post(url)
          .timeout({ response: 5000 })
          .set('accept', 'application/json', 'text/plain')
          .set('x-okapi-token', authToken)
          .set('content-type', 'application/json')
          .send(data[d]);
        added++;
      } catch (e) {
        try {
          console.log(`  ${e} -- Trying PUT...`);
          let purl = url;
          if (!purl.match(/circulation-rules-storage/)) {
            purl += '/' + data[d].id;
          }
          console.log(`  PUT ${purl}...`);
          let res = await superagent
            .put(purl)
            .timeout({ response: 5000 })
            .set('accept', 'text/plain')
            .set('x-okapi-token', authToken)
            .set('content-type', 'application/json')
            .send(data[d]);
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
    } 
    console.log(`Added:   ${added}`);
    console.log(`Updated: ${updated}`);
    console.log(`Errors:  ${errors}`);
  } catch (e) {
    console.error(e.message);
  }
})();
