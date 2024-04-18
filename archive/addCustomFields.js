/*
  Make PUT request to custom-fields endpoint (for users, right now).  An existing accordion title is required.
  NOTE: x-okapi-module-id header needs to be set.
*/

const fs = require('fs');
const superagent = require('superagent');
const { getAuthToken } = require('./lib/login');
let inFile = process.argv[2];

(async () => {
  try {
    let inData;
    if (!inFile) {
      throw new Error('Usage: node addCustomFields.js <custom_fields_file>');
    } else if (!fs.existsSync(inFile)) {
      throw new Error('Can\'t find input file');
    } else {
      inData = require(inFile);
      if (!inData.customFields) {
        throw new Error('A "customFields" property is required in payload');
      }
    }
    const config = (fs.existsSync('./config.js')) ? require('./config.js') : require('./config.default.js');

    const authToken = await getAuthToken(superagent, config.okapi, config.tenant, config.authpath, config.username, config.password);
    
    let url = `${config.okapi}/configurations/entries?query=configName==custom_fields_label`;
    console.log(`Getting configuration settings at ${url}`);
    try {
      let res = await superagent
        .get(url)
        .set('x-okapi-token', authToken)
        .set('accept', 'application/json');
        if (res.body.totalRecords > 0) {
          let purl = `${config.okapi}/custom-fields`
          console.log(`  PUT to ${purl}`);
          try {
            let res = await superagent
              .put(purl)
              .send(JSON.stringify(inData))
              .set('x-okapi-token', authToken)
              .set('x-okapi-module-id', 'mod-users-18.1.2')
              .set('content-type', 'application/json')
              .set('accept', '*/*');
          } catch (e) {
            console.log(e.response.text || e);
          }
        } else {
          throw new Error(`Couldn't find existing accordion title for users.  Please add one via the UI first.`)
        }
    } catch (e) {
      console.log(`${e}`);
    } 
  } catch (e) {
    console.log(e.message);
  }
})();
