/*
This script will stream instance, holdings, or item json objects from large collections.
options: 
-s start record
-r root node (an array of folio records)
*/

const fs = require('fs');
const superagent = require('superagent');
const winston = require('winston');
const JSONStream = require('JSONStream');
const es = require('event-stream');
const argv = require('minimist')(process.argv.slice(2));
console.log(argv);

const { getAuthToken } = require('./lib/login');
let inFile = argv._[0];
let root = (argv.r)? argv.r + '.*' : '*';
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
      throw new Error('Usage: node loadInstances.js [options -s start, -r root] <file>');
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

    let updated = 0;
    let success = 0;
    let fail = 0;
    let count = startRec;
    let failedRecs = [];

    const runRequest = async (data, es) => {
      let endpoint = null;
      if (data.instanceId) {
        endpoint = '/holdings-storage/holdings';
      } else if (data.holdingsRecordId) {
        endpoint = '/item-storage/items';
      } else {
        endpoint = '/instance-storage/instances';
      }
      const actionUrl = config.okapi + endpoint;
      console.log(`# ${count} Loading ${data.id}`);
      count++;
      try {
        await superagent
          .post(actionUrl)
          .send(data)
          .set('x-okapi-token', authToken)
          .set('content-type', 'application/json')
          .set('accept', 'application/json');
        logger.info('Successfully added record');
        success++;
      } catch (e) {
        logger.error(`${data.id}: ${e.response.text}`);
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
    console.error(e.message);
  } 
})();
