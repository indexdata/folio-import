/*
  Download up to 1000 records from an okapi endpoint and delete each by id, or read from a json/jsonl file
  and do the same (this is good for "undoing" loads).
*/

const fs = require('fs');
const superagent = require('superagent');
const readline = require('readline');
const { getAuthToken } = require('./lib/login');
let endpoint = process.argv[2];
const objFile = process.argv[3];

const wait = (ms) => {
  console.log(`(Waiting ${ms} ms...)`);
  return new Promise((resolve) => setTimeout(resolve, ms));
};

(async () => {
  try {
    let inData;
    if (!endpoint) {
      throw new Error('Usage: node deleteByEndpoint.js <endpoint> [ object_file ]');
    }

    let config = await getAuthToken(superagent);

    endpoint = endpoint.replace(/^\//, '');
    if (endpoint.match(/^_/)) {
      endpoint = endpoint.replace(/^_\//, '');
      endpoint = endpoint.replace(/__/g, '/');
    }
    let getUrl = config.okapi + '/' + endpoint + '?limit=1000';
    if (endpoint.match(/\?/)) getUrl = config.okapi + '/' + endpoint;
    if (endpoint.match(/^(erm|licenses)\//)) {
      getUrl = config.okapi + '/' + endpoint + '?perPage=100&stats=true';
    }
    endpoint = endpoint.replace(/\?.+/, '');
    const deleteUrl = config.okapi + '/' + endpoint;
    let refData = {};
    console.log(getUrl);

    if (objFile) {
      try {
        if (objFile.match(/\.jsonl$/)) throw new Error('Looks like a JSONL file.');
        refData = JSON.parse(fs.readFileSync(objFile, 'utf8'));
      } catch (e) {
        const fileStream = fs.createReadStream(objFile);
        const rl = readline.createInterface({
          input: fileStream,
          crlfDelay: Infinity
        });
        refData.records = [];
        for await (const line of rl) {
          inObj = JSON.parse(line);
          refData.records.push(inObj);
        }
      }
    } else {
      try {
        const res = await superagent
          .get(getUrl)
          .set('User-Agent', config.agent)
          .set('accept', 'application/json')
          .set('x-okapi-tenant', config.tenant)
          .set('x-okapi-token', config.token);
        refData = res.body;
      } catch (e) {
        console.log(e);
      }
    }

    let root;
    const firstLevel = Object.keys(refData);
    firstLevel.forEach(l => {
      if (!l.match(/totalRecords|resultInfo/)) {
        root = l;
      }
    });

    if (endpoint.match(/^(erm|licenses)\//) && !objFile) root = 'results';
    console.log(`Deleting ${refData.totalRecords} ${root}...`);
    for (let x = 0; x < refData[root].length; x++) {
      let id = refData[root][x].id || refData[root][x].jobExecutionId;
      let lDate = new Date();
      if (config.expiry && config.expiry <= lDate.valueOf()) {
        config = await getAuthToken(superagent);
      }
      console.log(`[${x}] ${lDate.toISOString()} Deleting ${id}`);
      try {
      	await superagent
          .delete(`${deleteUrl}/${id}`)
          .set('User-Agent', config.agent)
          .set('accept', '*/*')
          .set('x-okapi-tenant', config.tenant)
          .set('x-okapi-token', config.token);
      } catch (e) {
        console.log(`${e}`);
      }
      if (config.delay) await wait(config.delay);
    }
  } catch (e) {
    console.log(e.message);
  }
})();
