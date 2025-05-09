/*
  Given an accountsDates.jsonl file, lookup the actual-cost-record and change the associated
  account createDate to whatever is in the accountDates.jsonl file 
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

const getId = async (config, id, ep) => {
  let url = `${config.okapi}/${ep}/${id}`;
  console.log(`GET ${url}`);
  let rec;
  try {
    res = await superagent
      .get(url)
      .set('x-okapi-token', config.token);
    rec = res.body;
  } catch (e) {
    console.log(`${e}`);
  }
  return rec;
}

const getQuery = async (config, query, ep) => {
  let url = `${config.okapi}/${ep}?query=${query}`;
  console.log(`GET ${url}`);
  let recs;
  try {
    let res = await superagent
      .get(url)
      .set('x-okapi-token', config.token);
    recs = res.body;
  } catch (e) {
    console.log(`${e}`);
  }
  return recs;
}

const putId = async (config, id, ep, payload) => {
  let url = `${config.okapi}/${ep}/${id}`;
  console.log(`PUT ${url}`);
  try {
    res = await superagent
      .put(url)
      .send(payload)
      .set('content-type', 'application/json')
      .set('x-okapi-token', config.token);
  } catch (e) {
    console.log(e);
  }
}

(async () => {
  try {
    if (!inFile) {
      throw ('Usage: node changeAccountDate.js <actionsDates.jsonl>');
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
      let drec = JSON.parse(line);
      let arecs = await getQuery(config, `userId==${drec.uid}%20AND%20itemId==${drec.iid}`, 'accounts');
      if (arecs && arecs.accounts) {
        for (let x = 0; x < arecs.accounts.length; x++) {
          let arec = arecs.accounts[x];
          let frecs = await getQuery(config, `accountId==${arec.id}`, 'feefineactions');
          for (let y = 0; y < frecs.feefineactions.length; y++) {
            let frec = frecs.feefineactions[y];
            frec.dateAction = drec.date;
            await putId(config, frec.id, 'feefineactions', frec);
          }
        }
      }
    }

    let end = new Date().valueOf();
    let tt = (end - start)/1000;
    console.log('Done!');
    console.log('Count:', c);
    console.log('Time:', tt);

  } catch (e) {
    let msg = (debug) ? e : `${e}`; 
    console.log(msg);
  }
    
})();
