/*
  Download up to 1000 snapshots and delete each (and associated records) by id
*/

const fs = require('fs');
const superagent = require('superagent');
const { getAuthToken } = require('./lib/login');
let anything = process.argv[2];

try {
if (!anything) {
  throw new Error ('This script will delete all SRS records. You must provide the tenant or jobExecutionId');
}

const wait = (ms) => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

(async () => {
  try {
    let inData;
    let single;
    let ttl = 0;
    let skipped = 0;

    let config = await getAuthToken(superagent);
    if (anything.match(/........-....-....-....-............/)) {
      single = anything;
    } else if (config.tenant !== anything) {
      throw new Error(`Tenant "${anything}" does not match the current tenant "${config.tenant}!`);
    }

    const endpoint = 'source-storage/snapshots';
    const getUrl = config.okapi + '/' + endpoint + '?limit=1000';
    let refData = {};

    if (single) {
      refData = { snapshots: [{ jobExecutionId: single }], totalRecords: 1 };
    } else {
      try {
        const res = await superagent
          .get(getUrl)
          .set('accept', 'application/json')
          .set('x-okapi-tenant', config.tenant)
          .set('x-okapi-token', config.token); 
        refData = res.body;
      } catch (e) {
        console.log(e);
      }
    }

    console.log(`Deleting ${refData.totalRecords} snapshots...`);
    for (let x = 0; x < refData.snapshots.length; x++) {
      let id = refData.snapshots[x].jobExecutionId;
      let delFlag = false;
      try {
        let turl = `${config.okapi}/source-storage/records?recordType=MARC_BIB&snapshotId=${id}&limit=0`;
        console.log(`GET ${turl}`);
        let res = await superagent
          .get(turl)
          .set('accept', 'application/json')
          .set('x-okapi-tenant', config.tenant)
          .set('x-okapi-token', config.token);
        if (res && res.body) {
          if (res.body.totalRecords > 0) {
            delFlag = true;
          }
        }
      } catch (e) {}
      if (single) delFlag = true;
      if (delFlag) {
        console.log(`Deleting ${id}`);
        try {
          await superagent
            .delete(`${config.okapi}/source-storage/snapshots/${id}`)
            .set('accept', 'text/plain')
            .set('x-okapi-tenant', config.tenant)
            .set('x-okapi-token', config.token);
            ttl++;
        } catch (e) {
          let msg = (e.response) ? e.response.text : e;
          console.error(msg);
        }
      } else {
        console.log(`INFO no MARC_BIB records found with snapshotId ${id}-- skipping`);
        skipped++;
      }
      await wait(config.delay);
    } 
    console.log('Done!');
    console.log('Snapshots deleted:', ttl);
    console.log('Skipped:', skipped);
  } catch (e) {
    console.error(e.message);
  }
})();
} catch (e) {
  console.log(`${e}`);
}
