/*
  It is impossible to delete an agreement record if it has a linked license.
  This script will take a JSONL file of agreements, and delete the linked license,
  then PUT the changes to erm/sas.
*/

const fs = require('fs');
const superagent = require('superagent');
const readline = require('readline');
const { getAuthToken } = require('./lib/login');
const objFile = process.argv[2];


(async () => {
  try {
    let inData;
    if (!objFile) {
      throw new Error('Usage: node unlinkLicenses <agreements_file>');
    }

    const config = (fs.existsSync('./config.js')) ? require('./config.js') : require('./config.default.js');

    const authToken = await getAuthToken(superagent, config.okapi, config.tenant, config.authpath, config.username, config.password);

    let fileStream = fs.createReadStream(objFile);
    let rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });

    let c = 0;
    for await (const line of rl) {
      let o = JSON.parse(line);
      let url = `${config.okapi}/erm/sas/${o.id}`
      console.log('GET', url);
      try {
        let res = await superagent
          .get(url)
          .set('x-okapi-token', authToken);
        let j = res.body;
        if (j.linkedLicenses && j.linkedLicenses[0]) {
          for (let x = 0; x < j.linkedLicenses.length; x++ ) {
            j.linkedLicenses[x]._delete = true;
          }
          console.log('PUT', url);
          let pres = await superagent
            .put(url)
            .send(j)
            .set('x-okapi-token', authToken);
          console.log('Licenses unlinked:', res.body.linkedLicenses.length);
        }
      } catch (e) {
        console.log(e.message);
      }
      c++
    }
    console.log('Lines read:', c);

  } catch (e) {
    console.log(e.message);
  }
})();
