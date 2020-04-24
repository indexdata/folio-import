const fs = require('fs');
const superagent = require('superagent');
const { getAuthToken } = require('./lib/login');
const fn = process.argv[2];
const checkIn = process.argv[3];

(async () => {
  let added = 0;
  let updated = 0;
  let errors = 0;
  let deleted = 0;
  try {
    if (!fn) {
      throw new Error('Usage: node checkoutByBarcode.js <checkouts_file> [checkin]');
    }
    const config = (fs.existsSync('./config.js')) ? require('./config.js') : require('./config.default.js');

    const authToken = await getAuthToken(superagent, config.okapi, config.tenant, config.authpath, config.username, config.password);

    let collStr = fs.readFileSync(fn, 'utf8');
    let coll = JSON.parse(collStr);

    let url = `${config.okapi}/circulation/check-out-by-barcode`;
    let collRoot = 'checkouts';
    let data = coll[collRoot];
    let today;
    if (checkIn === 'checkin') {
      url = `${config.okapi}/circulation/check-in-by-barcode`;
      today = new Date().toISOString();
    }

    for (d = 0; d < data.length; d++) {
      if (checkIn === 'checkin') {
        delete data[d].loanDate;
        delete data[d].userBarcode;
        data[d].checkInDate = today;
      }
      // console.log(data[d]);
      try {
        console.log(`[${added}] POST ${url} (${data[d].itemBarcode})`);
        let res = await superagent
          .post(url)
          .timeout({ response: 10000 })
          .set('accept', 'application/json', 'text/plain')
          .set('x-okapi-token', authToken)
          .set('content-type', 'application/json')
          .send(data[d]);
        added++;
      } catch (e) {
        console.log(e);
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
