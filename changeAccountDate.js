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
  console.log(payload);
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
      throw ('Usage: node changeAccountDate.js <accountsDate.jsonl>');
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
      let crec = await getId(config, drec.id, 'actual-cost-record-storage/actual-cost-records');
      let aid = crec.feeFine.accountId;
      let frecs = await getQuery(config, `accountId==${aid}`, 'feefineactions');
      if (frecs && frecs.feefineactions) {
        for (let x = 0; x < frecs.feefineactions.length; x++) {
          let frec = frecs.feefineactions[x];
          frec.dateAction = drec.dateCreated;
          await putId(config, frec.id, 'feefineactions', frec);
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
