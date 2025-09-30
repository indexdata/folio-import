const fs = require('fs');
const superagent = require('superagent');
const readline = require('readline');
const path = require('path');
const { getAuthToken } = require('./lib/login');

let inDir = process.argv[2];

const cl = console.log;
const logSeen = {}
let logPath;
console.log = (msg, path) => {
  if (path) {
    if (!logSeen[path] && fs.existsSync(path)) fs.unlinkSync(path);
    fs.writeFileSync(path, msg + '\n', { flag: 'a'});
    logSeen[path] = 1;
  }
  cl(msg);
}

(async () => {
  try {
    const start = new Date().valueOf();
    if (!inDir) {
      throw 'Usage: node loadTroveUsers.js <trove_user_dir>';
    } else if (!fs.existsSync(inDir)) {
      throw new Error('Can\'t find input directory!');
    } 

    const postObjects = async (inFile, ep) => {
      const workingDir = path.dirname(inFile);
      const baseName = path.basename(inFile, '.jsonl');
      const errPath = `${workingDir}/${baseName}Err.jsonl`;
      if (fs.existsSync(errPath)) {
        fs.unlinkSync(errPath);
      }
      
      let config = await getAuthToken(superagent);
      let ten = config.tenant;

      const fileStream = fs.createReadStream(inFile);

      const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
      });
      
      let x = 0;
      console.log('------------------------', logPath);
      for await (const line of rl) {
        x++;
        let rec = JSON.parse(line);
        let actionUrl = `${config.okapi}/${ep}`;
        console.log(`[${x}][${ten}] POST ${rec.id} to ${actionUrl}`, logPath);
        try {
          let res = await superagent
            .post(actionUrl)
            .send(rec)
            .set('User-Agent', config.agent)
            .set('x-okapi-token', config.token)
            .set('content-type', 'application/json')
            .set('accept', 'application/json');
          console.log(`  Successfully added record id ${rec.id}`, logPath);
          success++;
        } catch (e) {
            let errMsg = (e.response && e.response.text) ? e.response.text : e;
            console.log(errMsg, logPath);
            rec._errMessage = errMsg;
            let recStr = JSON.stringify(rec);
            fs.writeFileSync(errPath, recStr + '\n', { flag: 'a'});
            fail++;
        }
      }
    }

    let success = 0;
    let fail = 0;

    inDir = inDir.replace(/\/$/, '');
    logPath = inDir + '/log.log';
    const cfile = inDir + '/config.json';
    if (fs.existsSync(cfile)) {
      fs.copyFileSync(cfile, './config.json');
    } else {
      throw new Error(`Can't find config file at ${inDir}!`);
    }

    const ufile = inDir + '/users.jsonl';
    if (fs.existsSync(ufile)) await postObjects(ufile, 'users');

    const pfile = inDir + '/perms.jsonl';
    if (fs.existsSync(pfile)) await postObjects(pfile, 'perms/users');

    const credFile = inDir + '/credentials.jsonl';
    if (fs.existsSync(credFile)) await postObjects(credFile, 'authn/credentials')

    console.log('----------------------------------', logPath);
    console.log(`Success: ${success}`, logPath);
    console.log(`Fail: ${fail}`, logPath);
    console.log('----------------------------------', logPath);

    let doneDir = inDir + '.DONE';
    if (success > 0) {
      fs.renameSync(inDir, doneDir);
    }

  } catch (e) {
    console.log(`${e}`);
  }
})();
