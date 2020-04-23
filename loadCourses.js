const fs = require('fs');
const superagent = require('superagent');
const { getAuthToken } = require('./lib/login');
const fn = process.argv[2];
const endpoints = [
  'terms',
  'courses',
  'courseListings',
  'instructors',
  'departments'
];

(async () => {
  let added = 0;
  let updated = 0;
  let errors = 0;
  let deleted = 0;
  try {
    if (!fn) {
      throw new Error('Usage: node loadCourses.js <file> [DELETE]');
    }
    const config = (fs.existsSync('./config.js')) ? require('./config.js') : require('./config.default.js');

    const authToken = await getAuthToken(superagent, config.okapi, config.tenant, config.authpath, config.username, config.password);

    let collStr = fs.readFileSync(fn, 'utf8');
    let coll = JSON.parse(collStr);

    let rootEndpoint = '';
    let endpoint;
    endpoints.forEach(e => {
      if (coll[e] && coll[e][0]) {
        endpoint = e;
      }
    });

    const base = `${config.okapi}/coursereserves`;

    let data = [];
    data = coll[endpoint];
    let url;

    for (d = 0; d < data.length; d++) {
      if (endpoint === 'instructors') {
        url = `${base}/courselistings/${data[d].courseListingId}/instructors`;
      } else {
        url = `${base}/${endpoint}`;
        url = url.toLocaleLowerCase();
      }
      try {
        if (process.argv[3] === 'DELETE') {
          url += `/${data[d].id}`;
          console.log(`[${deleted}] DELETE ${url}...`);
          await superagent
            .delete(url)
            .timeout({ response: 5000 })
            .set('accept', 'text/plain')
            .set('x-okapi-token', authToken)
          deleted++;
        } else {
          console.log(`[${added}] POST ${url}...`);
          let res = await superagent
            .post(url)
            .timeout({ response: 5000 })
            .set('accept', 'application/json', 'text/plain')
            .set('x-okapi-token', authToken)
            .set('content-type', 'application/json')
            .send(data[d]);
          added++;
        }
      } catch (e) {
        try {
          if (process.argv[3] === 'DELETE' && e.response) throw new Error(e.response.text);
          if (process.argv[3] !== 'DELETE') {
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
