const fs = require('fs');
const superagent = require('superagent');
let logDir = process.argv[2];
const usersFile = process.argv[3];
const tokenFile = '.okapi/token';
const urlFile = '.okapi/url';

let t = 0;
let c = 0;
let nf = 0;
(async () => {
  try {
    if (!usersFile) {
      throw('Usage: node cubMismatchedUsers.js <log_dir> <users-import-file>');
    }
    logDir = logDir.replace(/\/$/, '');
    let fn = usersFile.replace(/^.+\/(.+)\.json$/, '$1.log');
    let logFile = `${logDir}/${fn}`;
    let undoFile = usersFile.replace(/\.json/, '_undo.jsonl');
    let redoFile = logFile.replace(/\.log/, '_redo.log');

    if (fs.existsSync(undoFile)) fs.unlinkSync(undoFile);

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
      t = x + 1;
      console.log(`********** ${t} **********`);
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
        if (curUser) { 
          if (curUser.externalSystemId !== u.externalSystemId) {
            fs.writeFileSync(undoFile, JSON.stringify(curUser) + '\n', {flag: 'a'});
            curUser.externalSystemId = u.externalSystemId;
            console.log(`Changing externalSystemId from ${curUser.externalSystemId} to ${u.externalSystemId} for ${u.username}`);
            try {
              let purl = `${base}/users/${curUser.id}`;
              console.log(`PUT ${purl}`);
              let res = await superagent
                .put(purl)
                .send(curUser)
                .set('x-okapi-token', token)
                .set('content-type', 'application/json');
              c++;
            } catch (e) {
              console.log(`${e}`);
            }
          } else {
            console.log(`User ${u.username} already has an externalSystemId of ${u.externalSystemId}`);
          }
        } else {
          console.log(`User not found with username ${u.username} (${u.externalSystemId})`);
          nf++
        }
      } catch (e) {
        console.log(e)
      }
    }
    console.log('----------------------');
    console.log('Users processed', t);
    console.log('Users updated', c);
    console.log('Users not found', nf);
    console.log('----------------------');
    let ttl = fusers.length;
    users.users = fusers;
    users.totalRecords = ttl;
    if (ttl > 0) {
      try {
        let url = `${base}/user-import`
        console.log('*** Redoing failed user imports ***');
        console.log(`POST ${url}`);
        let res = await superagent
          .post(url)
          .send(users)
          .set('x-okapi-token', token)
          .set('content-type', 'application/json');
        fs.writeFileSync(redoFile, JSON.stringify(res.body, null, 2) + '\n');
        delete res.body.failedUsers;
        console.log(res.body);
      } catch (e) {
        console.log(e);
      }
    }
    

  } catch (e) {
    console.error(e);
  }
})();
