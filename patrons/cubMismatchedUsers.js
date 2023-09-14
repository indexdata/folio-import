const fs = require('fs');
let logDir = process.argv[2];
const usersFile = process.argv[3];


(async () => {
  try {
    if (!usersFile) {
      throw('Usage: node cubMismatchedUsers.js <log_dir> <users-import-file>');
    }
    logDir = logDir.replace(/\/$/, '');
    let fn = usersFile.replace(/^.+\/(.+)\.json$/, '$1.log');
    let logFile = `${logDir}/${fn}`;
    let redoFile = usersFile.replace(/\.json/, '_redo.json');

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
    f.forEach(u => {
      let k = u.username;
      fusers.push(umap[k]);
    });
    let ttl = fusers.length;
    users.users = fusers;
    users.totalRecords = ttl;
    let userStr = JSON.stringify(users, null, 2);
    console.log(`Writing ${ttl} users to ${redoFile}`);
    fs.writeFileSync(redoFile, userStr);
  } catch (e) {
    console.error(e);
  }
})();
