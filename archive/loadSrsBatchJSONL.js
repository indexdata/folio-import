/*
This script will batch load source records in jsonl format.
options: 
-s start record
-b batch size
*/

const fs = require('fs');
const superagent = require('superagent');
const winston = require('winston');
const readline = require('readline');
const argv = require('minimist')(process.argv.slice(2));

const { getAuthToken } = require('./lib/login');
let inFile = argv._[0];
let startRec = 1;
if (argv.s) {
  startRec = parseInt(argv.s, 10);
  console.log(`Starting at ${startRec}`);
}

let collSize = 50;
if (argv.b) {
  collSize = parseInt(argv.b, 10);
}

const wait = (ms) => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

(async () => {
  try {
    const start = new Date().valueOf();
    if (!inFile) {
      throw new Error('Usage: node loadSrsBatchJSONL.js [options -s start, -b batch size (default 50)] <file>');
    } else if (!fs.existsSync(inFile)) {
      throw new Error('Can\'t find input file');
    }
  
    const config = (fs.existsSync('./config.js')) ? require('./config.js') : require('./config.default.js');

    var logger;

    const lpath = config.logpath;
    const lname = inFile.replace(/.+\//, '');

    if (config.logpath) {
      logger = winston.createLogger({
        level: 'info',
        format: winston.format.json(),
        defaultMeta: { service: 'user-service' },
        transports: [
          new winston.transports.File({ filename: `${lpath}/${lname}.log` })
        ]
      });
    } else {
      logger = console;
    }

    const res = await getAuthToken(superagent, config.okapi, config.tenant, config.authpath, config.username, config.password, true);
    const authToken = res.headers['x-okapi-token'];
    const userId = res.body.user.id;
    const now = new Date().toISOString(); 

    const metadata = {
      createdDate: now,
      updatedDate: now,
      createdByUserId: userId,
      updatedByUserId: userId
    };

    let success = 0;
    let fail = 0;

    const runRequest = (data, count, end) => {
      return new Promise(async (resolve, reject) => {
        let date = new Date().toISOString();
        let endpoint = '/source-storage/batch/records';
        const actionUrl = config.okapi + endpoint;
        const range = `${count}-${end}`;
        const slice = `${data.records[0].id} - ${data.records[data.records.length - 1].id}`;
        logger.info(`# ${range} Loading section ${slice}`);
        data.totalRecords = data.records.length;
        const ldata = { records: data.records };
        try {
          await superagent
            .post(actionUrl)
            .send(data)
            .set('x-okapi-token', authToken)
            .set('content-type', 'application/json')
            .set('accept', 'text/plain')
            .set('connection', 'keep-alive');
          logger.info(`${date} [${range}] Successfully added record ${slice}`);
          success++;
          await wait(config.delay);
          resolve();
        } catch (e) {
          logger.error(`${date} [${range}] (${slice}): ${e.response.text}`);
          if (lpath) {
            let rfname = lname.replace(/\.json$/, '');
            fs.writeFileSync(`${lpath}/${rfname}_${range}_err.json`, JSON.stringify(ldata, null, 2));
          }
          fail++;
          await wait(config.delay);
          reject(e.response.text);
        }
      });
    }

    const fileStream = fs.createReadStream(inFile, { encoding: "utf8" });
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });

    let ttl = 0
    let endRec = 0;
    let startNum = startRec;
    let coll = { records: [] };
    
    for await (const line of rl) {
      ttl++;
      if (ttl >= startRec) {
        endRec++;
        let json = JSON.parse(line);
        if (!json.metadata) {
          json.metadata = metadata;
        }
        coll.records.push(json);
        
        if (endRec%collSize === 0) {
          try {
            await runRequest(coll, startNum, ttl);
          } catch (e) {
            logger.error(e);
          }
          startNum = ttl + 1;
          coll.records = [];
        }
      }
    }

    if (Object.keys(coll).length > 0) {
      try {
        await runRequest(coll, startNum, ttl);
      } catch (e) {
      }
    }

    const showStats = () => {
      const end = new Date().valueOf();
      const ms = end - start;
      const time = Math.floor(ms / 1000);
      logger.info(`\nTime:            ${time} sec`);
      logger.info(`Batches added:   ${success} (${collSize} recs per batch)`);
      logger.info(`Failures:        ${fail}\n`);
    }
    showStats();
  } catch (e) {
    console.error(e.message);
  } 
})();
