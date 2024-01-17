const fs = require('fs');
const superagent = require('superagent');
const { getAuthToken } = require('./lib/login');
let inFile = process.argv[2];

const wait = (ms) => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

(async () => {
  try {
    let usersFile;
    if (!inFile) {
      throw new Error('Usage: node deleteUsers.js <users_file>');
    } else if (!fs.existsSync(inFile)) {
      throw new Error('Can\'t find input file');
    } else {
      usersFile = require(inFile);
    }
    const config = (fs.existsSync('./config.js')) ? require('./config.js') : require('./config.default.js');

    const authToken = await getAuthToken(superagent, config.okapi, config.tenant, config.authpath, config.username, config.password);

    const actionUrl = config.okapi + '/users';
    const permsUrl = config.okapi + '/perms/users';

    const inData = usersFile.users;
    for (let x = 0; x < inData.length; x++) {
      let id = inData[x].id;
      let permId = null;
      if (inData[x].personal !== undefined) {
        console.log(`Deleting ${id} -- ${inData[x].personal.lastName}`);
      } else {
        console.log(`Deleting ${id}`);
      }
      try {
        await superagent
          .delete(`${actionUrl}/${id}`)
          .set('accept', 'text/plain')
          .set('x-okapi-token', authToken);
      } catch (e) {
        console.error(e.response.text);
      }
      try {
        const res = await superagent
          .get(`${permsUrl}?query=userId==%22${id}%22`)
          .set('accept', 'application/json')
          .set('x-okapi-token', authToken);
        if (res.body.permissionUsers[0]) {
          permId = res.body.permissionUsers[0].id
          try {
            console.log(`Removing permission ${permId} (userId: ${id})`);
            await superagent
              .delete(`${permsUrl}/${permId}`)
              .set('accept', 'text/plain')
              .set('x-okapi-tenant', config.tenant)
              .set('x-okapi-token', authToken);
          } catch (e) {
            console.error(e.response.text);
          }
        }
      } catch (e) {
        console.error(e.response.text);
      }
      await wait(config.delay);
    }
  } catch (e) {
    console.error(e.message);
  }
})();
