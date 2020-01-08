/*
This script will stream instance, holdings, or item json objects from large collections.
options: 
-s start record
-r root node (an array of folio records)
-b batch size
*/

const fs = require('fs');
const superagent = require('superagent');
const winston = require('winston');
const JSONStream = require('JSONStream');
const es = require('event-stream');
const argv = require('minimist')(process.argv.slice(2));

const { getAuthToken } = require('./lib/login');
let inFile = argv._[0];
let root = (argv.r) ? argv.r + '.*' : '*';
let method = (argv.m && argv.m.match(/put/i)) ? 'put' : 'post';
let startRec = 0;
if (argv.s) {
  startRec = parseInt(argv.s, 10);
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
      throw new Error('Usage: node loadInstancesBatchStream.js [options -s start, -r root, -b batch size (default 1000)] <file>');
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

    const authToken = await getAuthToken(superagent, config.okapi, config.tenant, config.authpath, config.username, config.password);

    let success = 0;
    let fail = 0;
    let failedRecs = [];

    const runRequest = async (data, es, count, end) => {
      let date = new Date().toISOString();
      let endpoint = null;
      let root = null;
      if (data.holdingsRecords) {
        endpoint = '/holdings-storage/batch/synchronous';
        root = 'holdingsRecords'
      } else if (data.items) {
        endpoint = '/item-storage/batch/synchronous';
        root = 'items';
      } else {
        endpoint = '/instance-storage/batch/synchronous';
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
      } catch (e) {
        logger.error(`${date} [${range}] (${slice}): ${e.response.text}`);
        let rfname = lname.replace(/\.json$/, '');
        fs.writeFileSync(`${lpath}/${rfname}_${range}_err.json`, JSON.stringify(ldata, null, 2));
        fail++;
      }
      await wait(config.delay);
      es.resume(); 
    }

    const stream = fs.createReadStream(inFile, { encoding: "utf8" });
    let streamCount = 0;
    let coll = { start: true };
    let collRoot = null;
    let startRecord = startRec;
    stream
      .pipe(JSONStream.parse(root))
      .pipe(es.through(function write(data) {
        if (coll.start) {
          if (data.instanceId) {
            collRoot = 'holdingsRecords';
          } else if (data.holdingsRecordId) {
            collRoot = 'items';
          } else {
            collRoot = 'instances';
          }
          coll[collRoot] = [];
          delete coll.start;
        }
        if (streamCount >= startRec) {
          if (coll[collRoot].length <= collSize) {
            coll[collRoot].push(data);
          }
          if (coll[collRoot].length === collSize) {
            runRequest(coll, this, startRecord, streamCount);
            this.pause();
            coll[collRoot] = [];
            startRecord = streamCount + 1;
          }
        }
        streamCount++;
        }, 
        async function end() {
          if (coll[collRoot].length > 0) {
            await runRequest(coll, this, startRecord, streamCount);
            this.pause();
          }
          showStats();
          this.emit('end')
        })
      ); 

    const showStats = () => {
      const end = new Date().valueOf();
      const ms = end - start;
      const time = Math.floor(ms / 1000);
      logger.info(`\nTime:          ${time} sec`);
      logger.info(`Files added:   ${success} (${collSize} recs per file)`);
      logger.info(`Failures:      ${fail}\n`);
    }
  } catch (e) {
    console.error(e.message);
  } 
})();
