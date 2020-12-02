/*
This script will stream instance, holdings, or item json objects from large collections.
options: 
-s start record
-b batch size
-u upsert (true or false)
*/

const fs = require('fs');
const superagent = require('superagent');
const winston = require('winston');
const readline = require('readline');
const argv = require('minimist')(process.argv.slice(2));

const { getAuthToken } = require('./lib/login');
let inFile = argv._[0];
let root = (argv.r) ? argv.r + '.*' : '*';
let method = (argv.m && argv.m.match(/put/i)) ? 'put' : 'post';
let startRec = 1;
let upsert = '';
if (argv.s) {
  startRec = parseInt(argv.s, 10);
  console.log(`Starting at ${startRec}`);
}
if (argv.u === 'true') {
  upsert = '?upsert=true';
}

let collSize = 1000;
if (argv.b) {
  collSize = parseInt(argv.b, 10);
}

const wait = (ms) => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

(async () => {
  try {
    const start = new Date().valueOf();
    let inData;
    if (!inFile) {
      throw new Error('Usage: node loadInventorySyncJSONL.js [options -s start, -b batch size (default 1000) -u upsert (true|false)] <file>');
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
    let failedRecs = [];

    const runRequest = (data, count, end) => {
      return new Promise(async (resolve, reject) => {
        let date = new Date().toISOString();
        let endpoint = null;
        let root = null;
        if (data.holdingsRecords) {
          endpoint = '/holdings-storage/batch/synchronous' + upsert;
          root = 'holdingsRecords'
        } else if (data.items) {
          endpoint = '/item-storage/batch/synchronous' + upsert;
          root = 'items';
        } else {
          endpoint = '/instance-storage/batch/synchronous' + upsert;
          root = 'instances';
        }
        const actionUrl = config.okapi + endpoint;
        const range = `${count}-${end}`;
        const slice = `${data[root][0].id} - ${data[root][data[root].length - 1].id}`;
        console.log(`# ${range} Loading section ${slice}`);
        const ldata = { [root]: data[root] };
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
    let coll = {};
    
    await rl.on('close', async () => {
      
    });

    for await (const line of rl) {
      ttl++;
      if (ttl >= startRec) {
        endRec++;
        let json = JSON.parse(line);
        if (!json.metadata) {
          json.metadata = metadata;
        }
        if (json.holdingsRecordId) {
          if (!coll.items) coll.items = [];
          coll.items.push(json);
        } else if (json.instanceId) {
          if (!coll.holdingsRecords) coll.holdingsRecords = [];
          coll.holdingsRecords.push(json);
        } else {
          if (!coll.instances) coll.instances = [];
          coll.instances.push(json);
        }
        if (endRec%collSize === 0) {
          try {
            await runRequest(coll, startNum, ttl);
          } catch (e) {
          }
          startNum = ttl + 1;
          coll = {};
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
