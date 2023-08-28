const fs = require('fs');
const superagent = require('superagent');
const readline = require('readline');

const { getAuthToken } = require('./lib/login');
let inFile = process.argv[2];
let debug = process.env.DEBUG;
let dolog = process.env.LOG;

(async () => {
  try {
    const start = new Date().valueOf();
    if (!inFile) {
      throw 'Usage: node uuid2barcodeRequests.js <requests_file_jsonl>';
    } else if (!fs.existsSync(inFile)) {
      throw new Error('Can\'t find input file');
    } 
    const config = (fs.existsSync('./config.js')) ? require('./config.js') : require('./config.default.js');

    let limit = (process.argv[4]) ? parseInt(process.argv[4], 10) : 10000000;
    if (isNaN(limit)) {
      throw new Error('Limit must be a number.');
    }

    const authToken = await getAuthToken(superagent, config.okapi, config.tenant, config.authpath, config.username, config.password);


    const fileStream = fs.createReadStream(inFile);

    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });

    let x = 0;
    for await (const line of rl) {
      x++;
      let rec = JSON.parse(line);
      let uurl = `${config.okapi}/users/${rec.requesterId}`;
      let iurl = `${config.okapi}/inventory/items/${rec.itemId}`;
      let out = { errorMessage: rec.errorMessage };
      try {
        let res = await superagent
          .get(uurl)
          .set('x-okapi-token', authToken)
          .set('accept', 'application/json');
        out.user = res.body;
      } catch (e) {

        console.log(uurl, e.message);
      }
      try {
        let res = await superagent
          .get(iurl)
          .set('x-okapi-token', authToken)
          .set('accept', 'application/json');
        out.item = res.body;
        console.log(JSON.stringify(out));
      } catch (e) {
        console.log(iurl, e.message);
      }
    }
  } catch (e) {
    console.error(e);
  }
})();
