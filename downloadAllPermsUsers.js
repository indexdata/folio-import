const fs = require('fs');
const superagent = require('superagent');
const { getAuthToken } = require('./lib/login');
let refDir = process.argv[2];

(async () => {
  try {
    if (!refDir) {
      throw new Error('Usage: node downloadAllUserPerms.js <download_dir>');
    } else if (!fs.existsSync(refDir)) {
      throw new Error('Reference directory does\'t exist!');
    } else if (!fs.lstatSync(refDir).isDirectory()) {
      throw new Error(`${refDir} is not a directory!`)
    }
    const config = (fs.existsSync('./config.js')) ? require('./config.js') : require('./config.default.js');

    const authToken = await getAuthToken(superagent, config.okapi, config.tenant, config.authpath, config.username, config.password);

    refDir = refDir.replace(/\/$/,'');

    const actionUrl = config.okapi + '/perms/users';

    let totFetch = 0;
    let totRecs = 10000;
    let perPage = 100;
    let offset = 1;
    const coll = { permissionUsers: [] };
    while (totFetch < totRecs) {
      let url = `${actionUrl}?length=${perPage}&start=${offset}`;
      try {
        let res = await superagent
          .get(url)
          .timeout({response: 10000})
          .set('accept', 'application/json')
          .set('x-okapi-token', authToken);
        coll.permissionUsers = coll.permissionUsers.concat(res.body.permissionUsers);
        totFetch = coll.permissionUsers.length;
        totRecs = res.body.totalRecords;
      } catch (e) {
        try {
          console.log(e.response.text);
        } catch {
          console.log(e.message);
        }
      }
      offset += perPage;
      console.log(url);
      console.log(`Received ${totFetch} of ${totRecs}...`);
    }
    const fn = `${refDir}/perms%2Fusers.json`
    console.log(`Writing to ${fn}`);
    const jsonStr = JSON.stringify(coll, null, 2);
    fs.writeFileSync(fn, jsonStr);
  } catch (e) {
    console.error(e.message);
  }
})();
