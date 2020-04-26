const fs = require('fs');
const superagent = require('superagent');
const { getAuthToken } = require('./lib/login');
const fn = process.argv[2];
const checkIn = process.argv[3];

const wait = (ms) => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

const post_put = async (authToken, url, checkout, r) => {
  r = (r) ? r : 0;
  try {
    if (url.match(/\/loans\//)) {
      await superagent
        .put(url)
        .timeout({ response: 3000 })
        .set('accept', 'application/json', 'text/plain')
        .set('x-okapi-token', authToken)
        .set('content-type', 'application/json')
        .send(checkout);
      return;
    } else {
      let res = await superagent
        .post(url)
        .timeout({ response: 3000 })
        .set('accept', 'application/json', 'text/plain')
        .set('x-okapi-token', authToken)
        .set('content-type', 'application/json')
        .send(checkout);
      return res.body;
    }
  } catch (e) {
    if (e.code) {
      console.log(`    Connection timed out! Retrying (${r})...`);
      r++;
      if (r < 10) {
        let loanObj = await post_put(authToken, url, checkout, r);
        return loanObj;
      } else {
        throw new Error(`Too many retries (${r})!`);
      }
    } else {
      console.log(e.response.text);
    }
  }
}

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
      let dueDate;
      if (checkIn === 'checkin') {
        delete data[d].loanDate;
        delete data[d].userBarcode;
        data[d].checkInDate = today;
      } else {
       dueDate = data[d].dueDate;
       delete data[d].dueDate;
      }
      try {
        console.log(`[${d}] POST ${url} (${data[d].itemBarcode})`);
        let loanObj = await post_put(authToken, url, data[d]);
        if (checkIn === 'checkin') added++;
        if (checkIn !== 'checkin') {
          try {
            loanObj.dueDate = dueDate;
            loanObj.loanDate = data[d].loanDate;
            loanObj.action = 'dueDateChanged';
            let lurl = `${config.okapi}/circulation/loans/${loanObj.id}`;
            console.log(`[${d}] PUT ${lurl} (${data[d].itemBarcode})`);
            await post_put(authToken, lurl, loanObj);
            added++
          } catch (e) {
            let m;
            if (e.response) {
              m = e.response.text
            } else {
              m = e;
            }
            console.log(e);
            errors++;
          }
        }
      } catch (e) {
        let m;
        if (e.response) {
          m = e.response.text
        } else {
          m = e;
        }
        console.log(m);
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
