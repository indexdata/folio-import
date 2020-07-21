/*
This script will stream instance, holdings, or item json objects from large collections.
options:

-s start record
-r root node (an array of folio records)
-m method (post|put) defaults to post

Logs are committed to postgres database
*/

const fs = require('fs');
const superagent = require('superagent');
const winston = require('winston');
const PostgreSQL = require('./lib/winston-cl-pg');
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

const wait = (ms) => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

(async () => {
  try {
    const start = new Date().valueOf();
    let inData;
    if (!inFile) {
      throw new Error('Usage: node loadInstances.js [options -s start, -r root, -m method] <file>');
    } else if (!fs.existsSync(inFile)) {
      throw new Error('Can\'t find input file');
    }
  
    const config = (fs.existsSync('./config.js')) ? require('./config.js') : require('./config.default.js');

    var logger;

    const lpath = config.logpath;
    const lname = inFile.replace(/.+\//, '');

    if (config.logpath && config.logpath.match(/postgres:/)) {
      logger = winston.createLogger({
        defaultMeta: { filename: inFile },
        transports: [
          new PostgreSQL({
            connectionString: config.logpath,
            tableName: 'winston_logs',
          })]
      });
    } else if (config.logpath) {
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

    logger.info('Logging in');

    const authToken = await getAuthToken(superagent, config.okapi, config.tenant, config.authpath, config.username, config.password);

    let updated = 0;
    let success = 0;
    let fail = 0;
    let count = startRec;
    let failedRecs = [];

    const runRequest = async (data, es) => {
      let date = new Date().toISOString();
      let endpoint = null;
      if (data.instanceId) {
        endpoint = '/holdings-storage/holdings';
      } else if (data.holdingsRecordId) {
        endpoint = '/item-storage/items';
      } else if (data.succeedingInstanceId || data.precedingInstanceId) {
        endpoint = '/preceding-succeeding-titles';
      } else {
        endpoint = '/instance-storage/instances';
      }
      const actionUrl = config.okapi + endpoint;
      console.log(`# ${count} Loading ${data.id}`);
      method = (data.hrid && data.hrid.match(/\S/)) ? 'put' : 'post';
      count++;
      try {
        if (method === 'put') {
          await superagent
            .put(actionUrl + '/' + data.id)
            .send(data)
            .set('x-okapi-token', authToken)
            .set('content-type', 'application/json')
            .set('accept', 'text/plain')
            .set('connection', 'keep-alive');
          logger.info(`${date} [${count}] Successfully updated record ${data.id}`);
        } else {
          await superagent
            .post(actionUrl)
            .send(data)
            .set('x-okapi-token', authToken)
            .set('content-type', 'application/json')
            .set('accept', 'application/json')
            .set('connection', 'keep-alive');
          logger.info(`${date} [${count}] Successfully added record ${data.id}`);
        }
        success++;
      } catch (e) {
        logger.error(`${date} [${count}] (${data.id}): ${e.response.text}`);
        failedRecs.push(data);
        fail++;
      }
      await wait(config.delay);
      es.resume();
    }

    const stream = fs.createReadStream(inFile, { encoding: "utf8" });
    let streamCount = 0;
    stream
      .pipe(JSONStream.parse(root))
      .pipe(es.through(function write(data) {
        if (streamCount >= startRec) {
          runRequest(data, this);
          this.pause();
        }
          streamCount++;
        }, 
        function end() {
          showStats();
          this.emit('end')
        })
      ); 

    const showStats = () => {
      const end = new Date().valueOf();
      const ms = end - start;
      const time = Math.floor(ms / 1000);
      logger.info(`\nTime:            ${time} sec`);
      logger.info(`Records updated: ${updated}`);
      logger.info(`Records added:   ${success}`);
      logger.info(`Failures:        ${fail}\n`);
      if (config.logpath && failedRecs[0]) {
        let rfname = lname.replace(/\.json$/, '');
        fs.writeFileSync(`${lpath}/${rfname}_err.json`, JSON.stringify(failedRecs, null, 2));
      }
    }
  } catch (e) {
    console.error(e);
  } 
})();
