/*
  Given a file of users in jsonl format, delete the following objects: user, perms/users, request prefs.
  NOTE: should also check for loans and accounts also.
*/

const fs = require('fs');
const superagent = require('superagent');
const readline = require('readline');
const { getAuthToken } = require('./lib/login');

const inFile = process.argv[2];
const debug = process.env.DEBUG;

const wait = (ms) => {
  console.log(`(Waiting ${ms} ms...)`);
  return new Promise((resolve) => setTimeout(resolve, ms));
};

const epMap = {
  'perms/users': 'permissionUsers',
  'request-preference-storage/request-preference': 'requestPreferences'
}

const getId = async (config, uid, ep, prop) => {
  let q = `query=userId==${uid}`;
  let url = `${config.okapi}/${ep}?${q}`;
  console.log(`GET ${url}`);
  let id; 
  try {
    res = await superagent
      .get(url)
      .set('User-Agent', config.agent)
      .set('cookie', config.cookie)
      .set('x-okapi-tenant', config.tenant)
      .set('x-okapi-token', config.token)
    let arr = res.body[prop];
    if (arr && arr[0]) {
      id = arr[0].id;
    }
  } catch (e) {
    console.log(`${e}`);
  }
  return id;
}

const delId = async (config, id, ep) => {
  let url = `${config.okapi}/${ep}/${id}`;
  console.log(`DELETE ${url}`);
  let out;
  try {
    res = await superagent
      .delete(url)
      .set('User-Agent', config.agent)
      .set('cookie', config.cookie)
      .set('x-okapi-tenant', config.tenant)
      .set('x-okapi-token', config.token)
    out = res.body
  } catch (e) {
    console.log(`${e}`);
  }
}

(async () => {
  try {
    if (!inFile) {
      throw ('Usage: node deleteAllUserObjects.js <users_jsonl_files>');
    }

    let start = new Date().valueOf();

    let config = await getAuthToken(superagent);

    const fileStream = fs.createReadStream(inFile);
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });
    let c = 0;
    for await (const line of rl) {
      c++
      console.log(`-------------------- [${c}] --------------------`)
      let user = JSON.parse(line);
      await delId(config, user.id, 'users');
      for (let ep in epMap) {
        let prop = epMap[ep];
        let id = await getId(config, user.id, ep, prop);
        if (id) await delId(config, id, ep);
      }
    }

    let end = new Date().valueOf();
    let tt = (end - start)/1000;
    console.log('Done!');
    console.log('Users deleted:', c);
    console.log('Time:', tt);

  } catch (e) {
    let msg = (debug) ? e : `${e}`; 
    console.log(msg);
  }
    
})();
