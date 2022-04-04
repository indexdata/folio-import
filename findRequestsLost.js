/* 
  Find requests on items that have a status of Declared lost or Aged to lost.
*/


const fs = require('fs');
const superagent = require('superagent');
const readline = require('readline');
const path = require('path');

const { getAuthToken } = require('./lib/login');
let inFile = process.argv[2];

(async () => {
  try {
    const start = new Date().valueOf();
    if (!inFile) {
      throw 'Usage: node findRequestsLost.js <requests_jsonl_file>';
    } else if (!fs.existsSync(inFile)) {
      throw new Error('Can\'t find input file');
    } 
    const config = (fs.existsSync('./config.js')) ? require('./config.js') : require('./config.default.js');

    let limit = (process.argv[4]) ? parseInt(process.argv[4], 10) : 10000000;
    if (isNaN(limit)) {
      throw new Error('Limit must be a number.');
    }

    const workingDir = path.dirname(inFile);
    const baseName = path.basename(inFile, '.jsonl');
    const outfile = `${workingDir}/${baseName}_lost.jsonl`;
    if (fs.existsSync(outfile)) {
      fs.unlinkSync(outfile);
    }
    
    const authToken = await getAuthToken(superagent, config.okapi, config.tenant, config.authpath, config.username, config.password);

    const fileStream = fs.createReadStream(inFile);

    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });

    let found = 0;
    let matches = 0;

    let x = 0;
    for await (const line of rl) {
      x++;
      let rec = JSON.parse(line);
      if (rec.status.match(/open/i)) {
        let iid = rec.itemId;
        let url = `${config.okapi}/item-storage/items/${iid}`;
        console.log(`[${x}] GET ${url}`);
        try {
          let res = await superagent
            .get(url)
            .set('x-okapi-token', authToken)
            .set('accept', 'application/json');
          let irec = res.body;
          if (irec.status.name.match(/lost/i)) {
            let url = `${config.okapi}/instance-storage/instances?query=item.id==${irec.id}`;
            try {
            let res = await superagent
              .get(url)
              .set('x-okapi-token', authToken)
              .set('accept', 'application/json');
            let instRec = res.body.instances[0];
            rec.instanceId = instRec.id;
            fs.writeFileSync(outfile, JSON.stringify(rec) + '\n', { flag: 'as' });
            found++;
            } catch (e) {
              console.log(e);
            }

            // find viable items
            try {
              let url = `${config.okapi}/item-storage/items?query=instance.id==${rec.instanceId}`;
              let res = await superagent
                .get(url)
                .set('x-okapi-token', authToken)
                .set('accept', 'application/json');
              let items = res.body.items;
              let newId;
              let istatus;
              for (let x = 0; x < items.length; x++) {
                let item = items[x];
                if (!item.status.name.match(/unavailable|lost|missing/i)) {
                  console.log('Match found!');
                  newId = item.id;
                  istatus = item.status.name;
                  matches++;
                  break;
                }
              }
              if (newId) {
                let type = (istatus == 'Available') ? 'Page' : 'Hold';
                let payload = {
                  destinationItemId: newId,
                  requestType: type
                }
                try {
                  console.log(`Moving requestId ${rec.id} to itemId ${newId}`);
                  let url = `${config.okapi}/circulation/requests/${rec.id}/move`;
                  console.log(url);
                  await superagent
                    .post(url)
                    .send(payload)
                    .set('content-type', 'application/json')
                    .set('x-okapi-token', authToken)
                    .set('accept', 'application/json');
                } catch (e) {
                  console.log(e.response.text);
                }
                console.log(istatus);
              }
            } catch (e) {
              console.log(e);
            }
          }
        } catch (e) {
          console.log(e);
        }
      } else {
        console.log(`[${x}] WARN Request ${rec.id} is not Open`)
      }
    }
    const end = new Date().valueOf();
    const ms = end - start;
    const time = Math.floor(ms / 1000);
    console.log(`${x} records checked in ${time} sec.`)
    console.log(`${found} holds on lost items found.`);
    console.log(`${matches} viable matches found.`);
  } catch (e) {
    console.error(e);
  }
})();
