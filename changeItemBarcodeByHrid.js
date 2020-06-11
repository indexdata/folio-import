/*
  This script takes a collection of checkouts (checkout-by-barcode) and searches for the itemBarcode and
  Changes the status to "Checked out" along with the status date. Obviously these hard coded values can be
  changed to whatever.
*/

const fs = require('fs');
const superagent = require('superagent');
const { getAuthToken } = require('./lib/login');
const { exitOnError } = require('winston');
let inFile = process.argv[2];

const wait = (ms) => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

(async () => {
  try {
    let inData;
    if (!inFile) {
      throw new Error('Usage: node changeItemBarcodeByHrid.js <hrid_to_barcode_map> [<limit>]');
    } else if (!fs.existsSync(inFile)) {
      throw new Error('Can\'t find input file');
    } else {
      inData = fs.readFileSync(inFile, 'utf8');
    }
    const config = (fs.existsSync('./config.js')) ? require('./config.js') : require('./config.default.js');

    const lines = inData.split(/\n/);
    lines.pop();
    let limit = (process.argv[3]) ? parseInt(process.argv[3], 10) : lines.length;
    if (isNaN(limit)) {
      throw new Error('Limit must be a number.');
    }
    console.log(`Processing ${limit} lines...`);

    const authToken = await getAuthToken(superagent, config.okapi, config.tenant, config.authpath, config.username, config.password);
    
    for (let x = 0; x < limit; x++) {
      let [ hrid, bc ] = lines[x].split(/\t/);
      let url = `${config.okapi}/item-storage/items?query=hrid==${hrid}`;
      console.log(`Trying ${url}`);
      try {
        let res = await superagent
          .get(url)
          .set('x-okapi-token', authToken)
          .set('accept', 'application/json');
        if (res.body.totalRecords == 1) {
          item = res.body.items[0];
          item.barcode = bc;
          console.log(`[${hrid}] Setting barcode to ${bc}`);
          try {
            let purl = `${config.okapi}/item-storage/items/${item.id}`;
            console.log(`  PUT to ${purl}`);
            await superagent
              .put(purl)
              .send(item)
              .set('x-okapi-token', authToken)
              .set('content-type', 'application/json')
              .set('accept', 'text/plain');
          } catch (e) {
            console.log(e.response.text || e);
          } 
        } else {
          throw new Error(`No item record found for hrid == ${hrid}`);
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
