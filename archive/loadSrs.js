const fs = require('fs');
const superagent = require('superagent');
const uuid = require('uuid/v1');
const { getAuthToken } = require('./lib/login');
let inFile = process.argv[2];

/*
const wait = (ms) => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};
*/

(async () => {
  try {
    let inData;
    if (!inFile) {
      throw new Error('Usage: node loadSrs.js <srs_collection_file>');
    } else if (!fs.existsSync(inFile)) {
      throw new Error('Can\'t find input file');
    } else {
      inData = require(inFile);
      if (inData.records) {
        inData = inData.records;
      } 
    }
    const config = (fs.existsSync('./config.js')) ? require('./config.js') : require('./config.default.js');

    const authToken = await getAuthToken(superagent, config.okapi, config.tenant, config.authpath, config.username, config.password);

    const actionUrl = config.okapi + '/source-storage/records';
    const snapshotUrl = config.okapi + '/source-storage/snapshots';
    const snapId = uuid();

    // create snapshot
    try {
      console.log(`Creating snapshot with id: ${snapId}`);
      const snap = {}
      snap.jobExecutionId = snapId;
      snap.status = 'PARSING_IN_PROGRESS';
      res = await superagent
        .post(snapshotUrl)
        .send(snap)
        .set('x-okapi-tenant', config.tenant)
        .set('x-okapi-token', authToken)
        .set('content-type', 'application/json')
        .set('accept', 'application/json');
      const mesg = JSON.parse(res.text);
    } catch (e) {
      console.log(e.message);
    }

    // load srs records
    for (x = 0; x < inData.length; x++) {
      inData[x].snapshotId = snapId;
      console.log(`Loading SRS record ${inData[x].id}`);
      try {
        res = await superagent
          .post(actionUrl)
          .send(inData[x])
          .set('x-okapi-tenant', config.tenant)
          .set('x-okapi-token', authToken)
          .set('content-type', 'application/json')
          .set('accept', 'application/json');
        const mesg = JSON.parse(res.text);
      } catch (e) {
        const mesg = e;
        console.log(JSON.stringify(mesg, null, 2));
      }
    }

  } catch (e) {
    console.log(e);
  }
})();
