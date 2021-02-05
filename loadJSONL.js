const fs = require('fs');
const superagent = require('superagent');
const winston = require('winston');
const readline = require('readline');

const { getAuthToken } = require('./lib/login');
let inFile = process.argv[3];
let ep = process.argv[2];

(async () => {
  try {
    const start = new Date().valueOf();
    if (!inFile) {
      throw new Error('Usage: node loadJSONL.js <endpoint> <jsonl_file> [ <limit> ]');
    } else if (!fs.existsSync(inFile)) {
      throw new Error('Can\'t find input file');
    } 
    const config = (fs.existsSync('./config.js')) ? require('./config.js') : require('./config.default.js');

    let limit = (process.argv[4]) ? parseInt(process.argv[4], 10) : 10000000;
    if (isNaN(limit)) {
      throw new Error('Limit must be a number.');
    }
    
    var logger;

    if (config.logpath) {
      const lpath = config.logpath;
      const lname = inFile.replace(/.+\//, '');
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

    const actionUrl = `${config.okapi}/${ep}`;
    let updated = 0;
    let success = 0;
    let fail = 0;

    const fileStream = fs.createReadStream(inFile);

    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });

    let x = 0;
    for await (const line of rl) {
      x++;
      let rec = JSON.parse(line);
      logger.info(`[${x}] POST ${rec.id} to ${actionUrl}`);
      let recUrl = `${actionUrl}/${rec.id}`;
      try {
        await superagent
          .post(actionUrl)
          .send(rec)
          .set('x-okapi-token', authToken)
          .set('content-type', 'application/json')
          .set('accept', 'application/json');
        logger.info(`  Successfully added record id ${rec.id}`);
        success++;
      } catch (e) {
	let errMsg = (e.response.text) ? e.response.text : e;
        logger.warn(`  WARN ${errMsg}`);
        logger.info('  Trying PUT request...');
        try {
          await superagent
            .put(recUrl)
            .send(rec)
            .set('x-okapi-token', authToken)
            .set('content-type', 'application/json')
            .set('accept', 'text/plain');
          logger.info(`    Successfully updated record id ${rec.id}`);
          updated++;
        } catch (e) {
          logger.error(`     ERROR ${rec.id}: ${e}`);
          fail++;
        }
      }
    }
    const end = new Date().valueOf();
    const ms = end - start;
    const time = Math.floor(ms / 1000);
    logger.info(`\nTime:            ${time} sec`);
    logger.info(`Records updated: ${updated}`);
    logger.info(`Records added:   ${success}`);
    logger.info(`Failures:        ${fail}\n`);
  } catch (e) {
    console.error(e);
  }
})();
