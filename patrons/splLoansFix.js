
const fs = require('fs');
const path = require('path');
const uuid = require('uuid/v5');
const superagent = require('superagent');
const { getAuthToken } = require('../lib/login');
const { post } = require('superagent');

const jsonFile = process.argv[2];
const v = 'v2';

(async () => {
  try {
    if (jsonFile === undefined) {
      throw new Error('Usage: $ node splLoansFiex.js <loans file>');
    }
    if (!fs.existsSync(jsonFile)) {
      throw new Error('Can\'t find loans file');
    }

    const daysNow = Math.floor(new Date().valueOf()/1000/86400);
    const workDir = path.dirname(jsonFile);
    const outFile = `${workDir}/loans.jsonl`;
    if (fs.existsSync(outFile)) fs.unlinkSync(outFile);

    const getDateByDays = (days) => {
      const ms = days * 86400 * 1000;
      const rdate = new Date(ms).toISOString();
      return rdate;
    }

    const getData = async (url, authToken) => {
      try {
        const res = await superagent
          .get(url)
          .set('x-okapi-token', authToken);
          return res.body;
      } catch (e) {
        console.log(`${e}`);
      }
    }

    const putData = async (url, authToken, payload) => {
      try {
        const res = await superagent
          .put(url)
          .set('x-okapi-token', authToken)
          .set('content-type', 'application/json')
          .send(payload);
        return res.body;
      } catch (e) {
        console.log(`${e}`);
      }
    }

    const postData = async (url, authToken, payload) => {
      console.log(payload);
      try {
        const res = await superagent
          .post(url)
          .set('x-okapi-token', authToken)
          .set('content-type', 'application/json')
          .send(payload);
        return res.body;
      } catch (e) {
        console.log(`${e}`);
      }
    }    

    const config = (fs.existsSync('../config.js')) ? require('../config.js') : require('../config.default.js');

    const authToken = await getAuthToken(superagent, config.okapi, config.tenant, config.authpath, config.username, config.password);

    // get service points

    let sp = await getData(`${config.okapi}/service-points?limit=50`, authToken);

    spMap = {};
    sp.servicepoints.forEach(s => {
      let code = s.code.replace(/-.+$/, '');
      spMap[code] = s.id;
    });

    const loans = require(jsonFile);
    delete require.cache[require.resolve(jsonFile)];

    let success = 0;
    let nouser = 0;
    let noitem = 0;
    let checkedin = 0;
    let itemchanged = 0;
    
    let total = 0;
    const userCache = {};

    for (let x = 0; x < loans.length; x++) {
      let r = loans[x];
      total++;
      console.log(`[${total}] creating loan ${r.bbarcode} --> ${r.ibarcode}`)
      if (Number.isInteger(r.due_date)) {
        let loan = {};
        let users = {};
        if (userCache[r.bbarcode]) {
          users.users = [ userCache[r.bbarcode] ];
        } else {
          console.log(`INFO User barcode ${r.bbarcode} NOT found in cache-- looking up.`)
          users = await getData(`${config.okapi}/users?query=barcode==${r.bbarcode}`, authToken);
        }
        if (users.users[0]) {
          let item = {};
          let updateItemFlag = 0;
          let user = users.users[0];
          userCache[r.bbarcode] = user;
          loan.userId = user.id;
          loan.patronGroupIdAtCheckout = user.patronGroup;
          let items = await getData(`${config.okapi}/item-storage/items?query=barcode==${r.ibarcode}`, authToken);
          if (items.items[0]) {
            item = items.items[0];
            if (!item.lastCheckIn) {
              loan.itemId = item.id;
              if (item.status.name === 'Available') {
                item.status.name = 'Declared lost';
                updateItemFlag = 1;
              }
            } else {
              console.log(`${r.ibarcode} has been checked in.  Not creating loan object...`);
              checkedin++;
            }
          } else {
            console.log(`WARN No item found for ${r.ibarcode}!`);
            noitem++;
          }
          loan.loanDate = getDateByDays(r.last_cko_date);
          loan.dueDate = getDateByDays(r.due_date);
          loan.checkoutServicePointId = spMap[r.cko_location] || spMap.ill;
          loan.action = 'declaredLost';
          if (item.status.name === 'Claimed returned') {
            loan.action = 'claimedReturn';
          }
          let sn = 'open';
          if (item.status.name !== 'Declared lost') {
            sn = 'closed';
          }
          loan.status = { name: sn };
          loan.id = uuid(loan.userId + loan.itemId + v, '00000000-0000-0000-0000-000000000000');
          loan.loanPolicyId = 'd9cd0bed-1b49-4b5e-a7bd-064b8d177231';
          loan.lostItemPolicyId = 'c7d3b34c-69e6-4aea-ae36-d3a7ccf97d20';
          loan.itemStatus = item.status.name;
          if (updateItemFlag) {
            let iurl = `${config.okapi}/item-storage/items/${loan.itemId}`;
            console.log(`INFO Updating item record at ${iurl}`)
            await putData(iurl, authToken, item);
            itemchanged++;
          }
        } else {
          console.log(`WARN No user found for ${r.bbarcode}!`);
          nouser++;
        }
        if (loan.itemId) {
          fs.writeFileSync(outFile, JSON.stringify(loan) + '\n', { flag: 'a' });
          await postData(`${config.okapi}/loan-storage/loans`, authToken, loan);
          success++;
        }
      }
    }
    console.log(`Processed:  ${total}`);
    console.log(`Created:    ${success}`);
    console.log(`No item:    ${noitem}`);
    console.log(`No user:    ${nouser}`);
    console.log(`Checked in: ${checkedin}`);
    console.log(`Item chang: ${itemchanged}`);
  } catch (e) {
    console.error(e);
  }
})();
