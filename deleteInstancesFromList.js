/*
  Download up to 1000 records from an okapi endpoint and delete each by id
*/

const fs = require('fs');
const superagent = require('superagent');
const { getAuthToken } = require('./lib/login');
let listPath = process.argv[2];

const wait = (ms) => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

(async () => {
  try {
    let inData;
    if (!listPath) {
      throw new Error(`Usage: node deleteInstancesFromList.js <list_of_uuids_or_hrids>`);
    }

    const listFile = fs.readFileSync(listPath, 'utf8');

    const config = (fs.existsSync('./config.js')) ? require('./config.js') : require('./config.default.js');

    const authToken = await getAuthToken(superagent, config.okapi, config.tenant, config.authpath, config.username, config.password);

    const endpoint = 'instance-storage/instances';

    const lines = listFile.split(/\n/);

    for (let x = 0; x < lines.length - 1; x++) {

      let hrid;
      if (lines[x].match(/\w{8}-\w{4}-\w{4}-\w{4}-\w{12}/)) {
        hrid = false;
      } else {
        hrid = true;
      }

      let uuid;
      const deleteUrl = config.okapi + '/' + endpoint;

      if (hrid) {
        let getUrl = `${config.okapi}/${endpoint}?query=(hrid==${lines[x]})`;

        try {
          const res = await superagent
            .get(getUrl)
            .set('accept', 'application/json')
            .set('x-okapi-tenant', config.tenant)
            .set('x-okapi-token', authToken);
          const hits = res.body.totalRecords;
          if (hits === 1) {
            uuid = res.body.instances[0].id;
          } else {
            console.log(`No record found for ${lines[x]}`);
          }
        } catch (e) {
          console.log(e);
        }
      } else {
        uuid = lines[x];
      }
      if (uuid) {
        console.log(`Deleting ${lines[x]} (${uuid})`);
        try {
          await superagent
            .delete(`${deleteUrl}/${uuid}`)
            .set('accept', 'text/plain')
            .set('x-okapi-tenant', config.tenant)
            .set('x-okapi-token', authToken);
        } catch (e) {
          console.error(e.text);
        }
      }
      await wait(config.delay);
    }
  } catch (e) {
    console.error(e.message);
  }
})();
