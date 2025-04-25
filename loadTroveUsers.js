const fs = require('fs');
const superagent = require('superagent');
const readline = require('readline');
const path = require('path');
const { getAuthToken } = require('./lib/login');


let inDir = process.argv[2];

const wait = (ms) => {
  console.log(`(Waiting ${ms}ms...)`);
  return new Promise((resolve) => setTimeout(resolve, ms));
};

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

      const fileStream = fs.createReadStream(inFile);

      const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
      });
      
      let x = 0;
      console.log('------------------------');
      for await (const line of rl) {
        x++;
        let rec = JSON.parse(line);
        let actionUrl = `${config.okapi}/${ep}`;
        console.log(`[${x}] POST ${rec.id} to ${actionUrl}`);
        try {
          let res = await superagent
            .post(actionUrl)
            .send(rec)
            .set('x-okapi-token', config.token)
            .set('content-type', 'application/json')
            .set('accept', 'application/json');
          console.info(`  Successfully added record id ${rec.id}`);
          success++;
        } catch (e) {
            let errMsg = (e.response && e.response.text) ? e.response.text : e;
            console.log(errMsg);
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
    const cfile = inDir + '/config.json';
    fs.copyFileSync(cfile, './config.json');

    const ufile = inDir + '/users.jsonl';
    await postObjects(ufile, 'users');

    const pfile = inDir + '/perms.jsonl';
    await postObjects(pfile, 'perms/users');

    console.log('Success', success, 'Fail', fail);

  } catch (e) {
    console.log(`${e}`);
  }
})();
