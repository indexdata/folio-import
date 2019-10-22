/*
  Check for existance of credentials from users collection.  If credentials are not found for a user, then the user record
  is written to a file.
*/


const fs = require('fs');
const superagent = require('superagent');
const { getAuthToken } = require('./lib/login');
const inFile = process.argv[2];
const path = inFile.replace(/^(.+)\/.+/, '$1');

const wait = (ms) => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

(async () => {
  var users
  try {
    const start = new Date().valueOf();
    if (!inFile) {
      throw new Error('Usage: node checkLoginsFromUsers.js <users_file>');
    } else if (!fs.existsSync(inFile)) {
      throw new Error('Can\'t find input file');
    } else {
      users = require(inFile);
      if (users.users) {
        users = users.users;
      }
    }
    const config = (fs.existsSync('./config.js')) ? require('./config.js') : require('./config.default.js');

    const authToken = await getAuthToken(superagent, config.okapi, config.tenant, config.authpath, config.username, config.password);

    credUsers = { users: [] };
    for (let x = 0; x < users.length; x++) {
      const credsUrl = `${config.okapi}/authn/credentials-existence?userId=${users[x].id}`;
      let i = x + 1;
      try {
           res = await superagent
          .get(credsUrl)
          .set('x-okapi-token', authToken)
          .set('accept', 'application/json');
          console.log(res.body);
        if (res.body.credentialsExist === false) {
          credUsers.users.push(users[x]);
        } 
      } catch (e) {
        console.log(e.response.text);
      }
      await wait(config.delay);
    }
    if (credUsers.users[0]) {
      const fullPath = `${path}/credUsers.json`;
      console.log(`Writing to ${fullPath}`);
      fs.writeFileSync(fullPath, JSON.stringify(credUsers, null, 2));
    }
  } catch (e) {
    console.error(e.message);
  }
})();
