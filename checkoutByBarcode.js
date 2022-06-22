const fs = require('fs');
const superagent = require('superagent');
const path = require('path');
const { getAuthToken } = require('./lib/login');
const fn = process.argv[2];
const checkIn = process.argv[4];
const offset = process.argv[3] ? parseInt(process.argv[3], 10) : 0;
if (isNaN(offset)) throw new Error(`Limit must be a number!`);

let errs = { checkouts: [] };

const wait = (ms) => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

const post_put = async (authToken, url, checkout, r) => {
  r = (r) ? r : 0;
  try {
    if (url.match(/\/loans\//)) {
      await superagent
        .put(url)
        .timeout({ response: 10000 })
        .set('accept', 'application/json', 'text/plain')
        .set('x-okapi-token', authToken)
        .set('content-type', 'application/json')
        .send(checkout);
      return;
    } else {
      let res = await superagent
        .post(url)
        .timeout({ response: 10000 })
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
      throw new Error(e.response.text);
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
      throw new Error('Usage: node checkoutByBarcode.js <checkouts_file> [offset] [checkin]');
    }

    const dir = path.dirname(fn);
    const fname = path.basename(fn, '.json');

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


    for (d = offset; d < data.length; d++) {
      let dueDate;
      if (checkIn === 'checkin') {
        delete data[d].loanDate;
        delete data[d].userBarcode;
        delete data[d].expirationDate;
        data[d].checkInDate = today;
      } else {
       dueDate = data[d].dueDate;
       delete data[d].dueDate;
       delete data[d].expirationDate;
      }
      try {
        let uc = '';
        if (data[d].userBarcode) uc = ` --> ${data[d].userBarcode}`
	let postData = Object.assign({}, data[d]);
	delete postData.loanDate;
        console.log(`[${d}] POST ${url} (${data[d].itemBarcode}${uc})`);
        let loanObj = await post_put(authToken, url, postData);
        if (checkIn === 'checkin') added++;
        if (loanObj && checkIn !== 'checkin') {
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
        errs.checkouts.push(data[d]);
      }
    } 
    const errPath = `${dir}/${fname}_errors.json`;
    if (!checkIn) fs.writeFileSync(errPath, JSON.stringify(errs, null, 2));
    console.log(`Added:   ${added}`);
    console.log(`Updated: ${updated}`);
    console.log(`Errors:  ${errors}`);
    console.log(`Deleted: ${deleted}`)
  } catch (e) {
    console.error(e.message);
  }
})();
