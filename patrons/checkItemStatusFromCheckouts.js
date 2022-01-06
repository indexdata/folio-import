/* 
   Check item status from a checkout-by-barcode JSON file.
   If the status has been checked in delete it from the collection.
   Save file to new collection of checkouts
*/

const fs = require('fs');
const superagent = require('superagent');
const path = require('path');
const { getAuthToken } = require('../lib/login');

let inFile = process.argv[2];

(async () => {
  let cos;
  try {
    if (!inFile) {
      throw new Error('Usage: node checkItemStatusFromCheckouts.js <checkout_file>');
    } else if (!fs.existsSync(inFile)) {
      throw new Error('Can\'t find input file');
    } else {
      cos = require(inFile);
    }
    const config = (fs.existsSync('../config.js')) ? require('../config.js') : require('../config.default.js');

    const dir = path.dirname(inFile);

    const authToken = await getAuthToken(superagent, config.okapi, config.tenant, config.authpath, config.username, config.password);

    let newCheckouts = { checkouts: [] };

    // cos.checkouts.splice(100);

    for (let x = 0; x < cos.checkouts.length; x++) {
      let ibc = cos.checkouts[x].itemBarcode;
      let iurl = `${config.okapi}/item-storage/items?query=barcode==${ibc}`;
      try {
        let res = await superagent
          .get(iurl)
          .set('x-okapi-token', authToken);
        console.log(x);
        let item = res.body.items[0] || '';
        if (item && item.lastCheckIn) {
          console.log(item);
        } else {
          newCheckouts.checkouts.push(cos.checkouts[x]);
        }
      } catch (e) {
        console.log(e);
      }
    }
    fs.writeFileSync(`${dir}/checkouts_filtered.json`, JSON.stringify(newCheckouts, null, 2));
  } catch (e) {
    console.log(e);
  }
})();