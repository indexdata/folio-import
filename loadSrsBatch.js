const fs = require('fs');
const superagent = require('superagent');
const uuid = require('uuid/v1');
const { getAuthToken } = require('./lib/login');
let inFiles = process.argv.slice(2);

const delay = 5000;

const wait = (ms) => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

const config = (fs.existsSync('./config.js')) ? require('./config.js') : require('./config.default.js');

if (!inFiles[0]) {
  throw new Error('Usage: node loadSrs.js <srs_collection_files>');
}

(async () => {
  const authToken = await getAuthToken(superagent, config.okapi, config.tenant, config.authpath, config.username, config.password);
  for (f = 0; f < inFiles.length; f++) {
    let inFile = inFiles[f];
    try {
      let inData;
      if (!fs.existsSync(inFile)) {
        throw new Error('Can\'t find input file');
      } else {
        inData = require(inFile); 
	if (!inData.records) {
	  let tmp = inData;
          inData = {};
	  inData.records = tmp;
	  tmp = {};
	}
      }

      const actionUrl = config.okapi + '/source-storage/batch/records';
      const snapshotUrl = config.okapi + '/source-storage/snapshots';
      const snapId = uuid();
      inData.records.forEach(r => {
        r.snapshotId = snapId;
      });
      if (!inData.totalRecords) {
        inData.totalRecords = inData.records.length;
      }

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
      console.log(`Loading SRS records from ${inFile}`);
      try {
        res = await superagent
          .post(actionUrl)
          .send(inData)
          .set('x-okapi-tenant', config.tenant)
          .set('x-okapi-token', authToken)
          .set('content-type', 'application/json')
          .set('accept', 'application/json');
        const mesg = JSON.parse(res.text);
      } catch (e) {
        const mesg = e;
        console.log(JSON.stringify(mesg, null, 2));
      }
      console.log(`Waiting ${delay}ms...`);
      await wait(delay);
    } catch (e) {
      console.log(e);
    }
  }
})();
