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
      throw new Error('Usage: node loadSrs.js <marc_batch_file>');
    } else if (!fs.existsSync(inFile)) {
      throw new Error('Can\'t find input file');
    } else {
      inData = fs.readFileSync(inFile, 'utf8');
    }
    const config = (fs.existsSync('./config.js')) ? require('./config.js') : require('./config.default.js');

    const authToken = await getAuthToken(superagent, config.okapi, config.tenant, config.authpath, config.username, config.password);

    const actionUrl = config.okapi + '/source-storage/records';
    const snapshotUrl = config.okapi + '/source-storage/snapshots';
    const snapId = uuid();

    try {
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
      console.log(JSON.stringify(mesg, null, 2));
    } catch (e) {
      console.log(e.message);
    }

    try {
      let payload = {};
      payload.recordType = 'MARC';
      payload.rawRecord = {};
      payload.rawRecord.content = inData;
      payload.parsedRecord.content = inParsed;
      payload.matchedId = uuid();
      payload.snapshotId = snapId;
      res = await superagent
        .post(actionUrl)
        .send(payload)
        .set('x-okapi-tenant', config.tenant)
        .set('x-okapi-token', authToken)
        .set('content-type', 'application/json')
        .set('accept', 'application/json');
      const mesg = JSON.parse(res.text);
      console.log(JSON.stringify(mesg, null, 2));
    } catch (e) {
      const mesg = e;
      console.error(JSON.stringify(mesg, null, 2));
    }
  } catch (e) {
    console.error(e);
  }
})();
