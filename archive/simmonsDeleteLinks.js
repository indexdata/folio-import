/*
  This script will take a list of instance hrids and delete Internet Archives URLs from instances, holdings, items, and SRS.
*/

const fs = require('fs');
const superagent = require('superagent');
const path = require('path');
const { getAuthToken } = require('./lib/login');
let inFile = process.argv[2];

(async () => {
  try {
    let inData;
    if (!inFile) {
      throw new Error('Usage: node simmonsDeleteLinks.js <hrid file> [<limit>]');
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

    const workDir = path.dirname(inFile);

    const authToken = await getAuthToken(superagent, config.okapi, config.tenant, config.authpath, config.username, config.password);

    const instOut = { instances: [] };
    const holdOut = { holdingsRecords: [] };
    const itemOut = { items: [] };
    const recsOut = { records: [] };
    
    for (let x = 0; x < limit; x++) {
      let hrid = lines[x];
      hrid = hrid.replace(/\W+/g, '');
      console.log(`--- ${hrid} ---`);
      let url = `${config.okapi}/instance-storage/instances?query=hrid==${hrid}`;
      console.log(`[${x}] Getting ${url}`);
      try {
        let res = await superagent
          .get(url)
          .set('x-okapi-token', authToken)
          .set('accept', 'application/json');
        if (res.body.instances) {

          let rec = res.body.instances[0];
          if (rec.electronicAccess) {
            let ea = rec.electronicAccess;
            for (let e = 0; e < ea.length; e++) {
              if (ea[e].uri.match(/archive.org/)) {
                ea.splice(e, 1);
                e--;
              }
            }
          }

          instOut.instances.push(rec);
          let iid = res.body.instances[0].id;
          let url = `${config.okapi}/source-storage/formattedRecords/${iid}?identifier=INSTANCE`;
          console.log(`Getting source record at ${url}`);
          try {
            res = await superagent
              .get(url)
              .set('x-okapi-token', authToken)
              .set('accept', 'application/json');
            if (res.body) {
              recsOut.records.push(res.body);
            }
          } catch (e) {
            console.log(e);
          }
          url = `${config.okapi}/holdings-storage/holdings?query=instanceId==${iid}`;
          console.log(`Getting holdings records at ${url}`);
          try {
            res = await superagent
              .get(url)
              .set('x-okapi-token', authToken)
              .set('accept', 'application/json');
            if (res.body.holdingsRecords) {
              let hr = res.body.holdingsRecords;
              for (let h = 0; h < hr.length; h++) {
                let rec = hr[h];
                if (rec.electronicAccess) {
                  let ea = rec.electronicAccess;
                  for (let e = 0; e < ea.length; e++) {
                    if (ea[e].uri.match(/archive.org/)) {
                      ea.splice(e, 1);
                      e--;
                    }
                  }
                }
                holdOut.holdingsRecords.push(rec);
                let hid = hr[h].id;
                let url = `${config.okapi}/item-storage/items?query=holdingsRecordId==${hid}`;
                console.log(`Getting item records at ${url}`);
                try {
                  res = await superagent
                    .get(url)
                    .set('x-okapi-token', authToken)
                    .set('accept', 'application/json');
                  if (res.body.items) {
                    for (let i = 0; i < res.body.items.length; i++) {
                      let rec = res.body.items[i];
                      if (rec.electronicAccess) {
                        let ea = rec.electronicAccess;
                        for (let e = 0; e < ea.length; e++) {
                          if (ea[e].uri.match(/archive.org/)) {
                            ea.splice(e, 1);
                            e--;
                          }
                        }
                      }
                      itemOut.items.push(rec);
                    }
                  }
                } catch (e) {
                  console.log(e);
                }
              }
            }
          } catch (e) {
            console.log(e);
          }
        }
      } catch (e) {
        console.log(e.response || e);
      } 
    }
    fs.writeFileSync(`${workDir}/instances.json`, JSON.stringify(instOut, null, 2));
    fs.writeFileSync(`${workDir}/holdings.json`, JSON.stringify(holdOut, null, 2));
    fs.writeFileSync(`${workDir}/items.json`, JSON.stringify(itemOut, null, 2));
    fs.writeFileSync(`${workDir}/records.json`, JSON.stringify(recsOut, null, 2));
  } catch (e) {
    console.log(e.message);
  }
})();
