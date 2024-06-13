const fs = require('fs');
const superagent = require('superagent');
const path = require('path');
const { getAuthToken } = require('./lib/login');
const readline = require('readline');

const tout = 60000;
const fn = process.argv[2];
const checkIn = process.argv[4];
const offset = (process.argv[3]) ? parseInt(process.argv[3], 10) : 0;
if (isNaN(offset)) throw new Error(`Limit must be a number!`);

let errs = { checkouts: [] };

const wait = (ms) => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

const post_put = async (authToken, url, checkout, r) => {
  r = (r) ? r : 0;
  try {
    if (url.match(/.{8}-.{4}-.{4}-.{4}-.{12}$/)) {
      await superagent
        .put(url)
        .timeout(tout)
        .set('accept', 'application/json', 'text/plain')
        .set('x-okapi-token', authToken)
        .set('content-type', 'application/json')
        .send(checkout);
      return;
    } else {
      let res = await superagent
        .post(url)
        .timeout(tout)
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
      let text = e.response.text;
      if (text.match(/overridableBlock/) && !r) {
        let err = JSON.parse(text);
        err.errors.forEach(er => {
          if (er.message.match(/not loanable|blocked|maximum number/)) {
            block = er.overridableBlock;
          }
        });
        let name = block.name;
        checkout.overrideBlocks = {
          comment: 'Migration override',
          [name]: { dueDate: new Date().toISOString() },
        }
        if (name !== 'patronBlock') {
          checkout.overrideBlocks.patronBlock = {};
        }
        console.log(`WARN we've encountered a ${name} block, retrying with override...`);
        let body = await post_put(authToken, url, checkout, 1);
        return body;
      } else {
        throw(text);
      }
    }
  }
}

(async () => {
  let added = 0;
  let errors = 0;
  let claimed = 0;
  let claimedErrs = 0;
  try {
    if (!fn) {
      throw new Error('Usage: node checkoutByBarcode.js <checkouts_jsonl> [offset] [checkin]');
    }

    const dir = path.dirname(fn);
    const fname = path.basename(fn, '.jsonl');

    const saveFile = `${dir}/${fname}_done.jsonl`;
    if (fs.existsSync(saveFile)) {
      fs.unlinkSync(saveFile);
    }
    
    const errPath = `${dir}/${fname}_errors.jsonl`;
    if (fs.existsSync(errPath)) {
      fs.unlinkSync(errPath);
    }

    let config = await getAuthToken(superagent);

    let url = `${config.okapi}/circulation/check-out-by-barcode`;
    let today;

    if (checkIn === 'checkin') {
      url = `${config.okapi}/circulation/check-in-by-barcode`;
      today = new Date().toISOString();
    }

    const fileStream = fs.createReadStream(fn);
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });

    let d = 0;
    for await (let line of rl) {
      d++;
      let data = JSON.parse(line);
      delete data.errorMessage;
      let errData = JSON.parse(line);
      let errMsg;
      let dueDate;
      let claimedReturnedDate = '';
      let renewalCount = 0;
      if (checkIn === 'checkin') {
        delete data.loanDate;
        delete data.userBarcode;
        delete data.expirationDate;
        delete data.renewalCount;
        data.checkInDate = today;
      } else {
        dueDate = data.dueDate;
        delete data.dueDate;
        delete data.expirationDate;
        if (data.claimedReturnedDate) {
          claimedReturnedDate = data.claimedReturnedDate;
          delete data.claimedReturnedDate;
        }
        if (data.renewalCount) {
          renewalCount = data.renewalCount; 
          delete data.renewalCount;
        }
      }
      try {
        let uc = '';
        if (data.userBarcode) uc = ` --> ${data.userBarcode}`
	      let postData = Object.assign({}, data);

        console.log(`[${d}] POST ${url} (${data.itemBarcode}${uc})`);
        let loanObj = await post_put(config.token, url, postData);
        if (checkIn === 'checkin') added++;
        if (loanObj && checkIn !== 'checkin') {
          let loanStr = JSON.stringify(loanObj) + '\n';
          fs.writeFileSync(saveFile, loanStr, { flag: 'a' });
          try {
            loanObj.dueDate = dueDate;
            loanObj.loanDate = data.loanDate;
            loanObj.action = 'dueDateChanged';
            loanObj.renewalCount = renewalCount;
            delete loanObj.dueDateChangedByNearExpireUser;
            if (process.env.DEBUG) console.log(loanObj);
            let lurl = `${config.okapi}/circulation/loans/${loanObj.id}`;
            console.log(`[${d}] PUT ${lurl} (${data.itemBarcode})`);
            await post_put(config.token, lurl, loanObj);
            added++

            if (claimedReturnedDate) {
              try {
                let claimedObj = {};
                claimedObj.itemClaimedReturnedDateTime = claimedReturnedDate;
                claimedObj.comment = "Migrated action";
                let lurl = `${config.okapi}/circulation/loans/${loanObj.id}/claim-item-returned`;
                console.log(`[${d}] POST ${lurl} (${data.itemBarcode})`);
                await post_put(config.token, lurl, claimedObj);
                claimed++;
              } catch (e) {
                console.log(e);
                claimedErrs++;
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
      } catch (e) {
        let m;
        if (e.response) {
          m = e.response.text
        } else {
          m = e;
        }
        console.log(m);
        errMsg = m;
        if (errMsg) errData.errorMessage = errMsg;
        errors++;
        if (!checkIn) fs.writeFileSync(errPath, JSON.stringify(errData) + '\n', { flag: 'a' });
      }
    } 
    console.log('Added:', added);
    console.log('Claimed:', claimed);
    console.log('Errors:', errors);
    console.log('Claimed errors:', claimedErrs);
  } catch (e) {
    console.error(e.message);
  }
})();
