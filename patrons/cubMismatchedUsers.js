const fs = require('fs');
const superagent = require('superagent');
let logDir = process.argv[2];
const usersFile = process.argv[3];
const tokenFile = '.okapi/token';
const urlFile = '.okapi/url';

(async () => {
  try {
    if (!usersFile) {
      throw('Usage: node cubMismatchedUsers.js <log_dir> <users-import-file>');
    }
    logDir = logDir.replace(/\/$/, '');
    let fn = usersFile.replace(/^.+\/(.+)\.json$/, '$1.log');
    let logFile = `${logDir}/${fn}`;
    let redoFile = usersFile.replace(/\.json/, '_redo.json');

    let token = fs.readFileSync(tokenFile, {encoding: 'utf8'});
    token = token.trim();
    let base = fs.readFileSync(urlFile, {encoding: 'utf8'});
    base = base.trim();

    let users = require(usersFile);
    console.log(`Reading users from ${usersFile}`);
    let uc = 0;
    let umap = {};
    users.users.forEach(u => {
      umap[u.username] = u;
      uc++;
    });
    console.log(`(${uc} user records read)`);

    const logData = fs.readFileSync(logFile, { encoding: 'utf-8'});
    const log = JSON.parse(logData);
    let f = log.failedUsers;
    let fusers = [];
    for (let x = 0; x < f.length; x++) {
      let u = f[x];
      let k = u.username;
      fusers.push(umap[k]);
      let url = `${base}/users?query=username==${u.username}`;
      try {
        console.log(`GET ${url}`);
        let res = await superagent
          .get(url)
          .set('x-okapi-token', token);
        let curUser = res.body.users[0];
        if (curUser && curUser.externalSystemId !== u.externalSystemId) {
          curUser.externalSystemId = u.externalSystemId;
          console.log(curUser);
        }
      } catch (e) {
        console.log(e)
      }
    };
    let ttl = fusers.length;
    users.users = fusers;
    users.totalRecords = ttl;
    let userStr = JSON.stringify(users, null, 2);
    // console.log(`Writing ${ttl} users to ${redoFile}`);
    // fs.writeFileSync(redoFile, userStr);


  } catch (e) {
    console.error(e);
  }
})();
