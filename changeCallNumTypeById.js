/*
  This script will take a callNumberTypeId and a file of holdings ids and update the callNumberTypeId and itemCallNumberTypeId that 
  goes with the holdings record id.
*/

const fs = require('fs');
const superagent = require('superagent');
const { getAuthToken } = require('./lib/login');
const { exitOnError } = require('winston');
let inFile = process.argv[3];
let cnType = process.argv[2];

const wait = (ms) => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

(async () => {
  try {
    let inData;
    if (!inFile) {
      throw new Error('Usage: node changeCallNumTypeById.js <call_num_type_uuid> <file_of_holdings_ids> [<limit>]');
    } else if (!fs.existsSync(inFile)) {
      throw new Error('Can\'t find input file');
    } else {
      inData = fs.readFileSync(inFile, 'utf8');
    }
    const config = (fs.existsSync('./config.js')) ? require('./config.js') : require('./config.default.js');

    const lines = inData.split(/\n/);
    lines.pop();
    let limit = (process.argv[4]) ? parseInt(process.argv[4], 10) : lines.length;
    if (isNaN(limit)) {
      throw new Error('Limit must be a number.');
    }
    console.log(`Processing ${limit} lines...`);

    const authToken = await getAuthToken(superagent, config.okapi, config.tenant, config.authpath, config.username, config.password);
    
    for (let x = 0; x < limit; x++) {
      let [ id, cn ] = lines[x].split(/\s+/);
      let url = `${config.okapi}/holdings-storage/holdings/${id}`;
      console.log(`Getting ${url}`);
      try {
        let res = await superagent
          .get(url)
          .set('x-okapi-token', authToken)
          .set('accept', 'application/json');
        if (res.body.id) {
          let holdings = res.body;
          holdings.callNumberTypeId = cnType;
          console.log(`  [${res.body.hrid}] Setting callNumberTypeId to ${cnType}`);
          try {
            let purl = `${config.okapi}/holdings-storage/holdings/${id}`;
            console.log(`  PUT to ${purl}`);
            await superagent
              .put(purl)
              .send(holdings)
              .set('x-okapi-token', authToken)
              .set('content-type', 'application/json')
              .set('accept', 'text/plain');
            console.log(`  Finding items attached to ${id}`);
            try { 
              let itemUrl = `${config.okapi}/item-storage/items?limit=5000&query=holdingsRecordId%3D%3D${id}`;
              let res = await superagent
                .get(itemUrl)
                .set('x-okapi-token', authToken)
                .set('accept', 'application/json');
              let items = res.body.items;
              for (let i = 0; i < items.length; i++) {
                item = items[i];
                item.itemLevelCallNumberTypeId = cnType;
                if (item.effectiveCallNumberComponents) item.effectiveCallNumberComponents.typeId = cnType;
                console.log(`    Updating item with id ${item.id}`);
                try {
                  let itemPutUrl = `${config.okapi}/item-storage/items/${item.id}`;
                  await superagent
                    .put(itemPutUrl)
                    .send(item)
                    .set('x-okapi-token', authToken)
                    .set('content-type', 'application/json')
                    .set('accept', 'text/plain');
                } catch (e) {
                  console.log(e);
                }
              }
            } catch (e) {
              console.log(e);
            }
               
          } catch (e) {
            console.log(e.response || e);
          } 
        } else {
          throw new Error(`No holdings record found for id == ${id}`);
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
