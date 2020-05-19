/*
  This script takes a collection of checkouts (checkout-by-barcode) and searches for the itemBarcode and
  Changes the status to "Checked out" along with the status date. Obviously these hard coded values can be
  changed to whatever.
*/

const fs = require('fs');
const superagent = require('superagent');
const { getAuthToken } = require('./lib/login');
let inFile = process.argv[2];

const wait = (ms) => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

(async () => {
  try {
    const start = new Date().valueOf();
    let inData;
    if (!inFile) {
      throw new Error('Usage: node changeItemStatus.js <checkout_file> [ <limit> ]');
    } else if (!fs.existsSync(inFile)) {
      throw new Error('Can\'t find input file');
    } else {
      inData = require(inFile);
    }
    const config = (fs.existsSync('./config.js')) ? require('./config.js') : require('./config.default.js');

    let limit = (process.argv[3]) ? parseInt(process.argv[3], 10) : inData.checkouts.length;

    if (isNaN(limit)) {
      throw new Error('Limit must be a number.');
    }

    const authToken = await getAuthToken(superagent, config.okapi, config.tenant, config.authpath, config.username, config.password);

    
    for (let x = 0; x < limit; x++) {
      let bc = inData.checkouts[x].itemBarcode;
      let url = `${config.okapi}/item-storage/items?query=barcode==${bc}`;
      console.log(`Trying ${url}`);
      let newItem;
      try {
        let res = await superagent
          .get(url)
          .set('x-okapi-token', authToken)
          .set('accept', 'application/json');
        if (res.body.totalRecords == 1) {
          newItem = res.body.items[0];
          newItem.status = { name: 'Checked out', date: '2020-05-19T12:00:00.000+0000' };
          try {
            let purl = `${config.okapi}/item-storage/items/${newItem.id}`;
            console.log(`PUT to ${purl}`);
            await superagent
              .put(purl)
              .send(newItem)
              .set('x-okapi-token', authToken)
              .set('content-type', 'application/json')
              .set('accept', 'text/plain');
          } catch (e) {
            console.log(e.response.text || e);
          }
        } else {
          throw new Error(`More than one records was found for ${bc}`)
        }
      } catch (e) {
        console.log(e.response || e);
      }
      await wait(config.delay);
    } 
  } catch (e) {
    console.log(e.message);
  }
})();
