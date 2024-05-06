const fs = require('fs');
const superagent = require('superagent');
const winston = require('winston');
const readline = require('readline');
const path = require('path');

const { getAuthToken } = require('./lib/login');
let inFile = process.argv[2];

(async () => {
  try {
    const start = new Date().valueOf();
    if (!inFile) {
      throw new Error('Usage: node loadInterfaceCreds.js <jsonl_file> [ <limit> ]');
    } else if (!fs.existsSync(inFile)) {
      throw new Error('Can\'t find input file');
    } 

    let limit = (process.argv[3]) ? parseInt(process.argv[4], 10) : 10000000;
    if (isNaN(limit)) {
      throw new Error('Limit must be a number.');
    }

    const workingDir = path.dirname(inFile);
    const baseName = path.basename(inFile, '.jsonl');
    const errPath = `${workingDir}/${baseName}Err.jsonl`;
    if (fs.existsSync(errPath)) {
      fs.unlinkSync(errPath);
    }
    
    let config = await getAuthToken(superagent);

    var logger;

    if (config.logpath) {
      const lpath = config.logpath;
      const lname = inFile.replace(/.+\//, '');
      const logFileName = `${lpath}/${lname}.log`;
      if (fs.existsSync(logFileName)) {
        fs.unlinkSync(logFileName);
      }
      logger = winston.createLogger({
        level: 'info',
        format: winston.format.json(),
        defaultMeta: { service: 'user-service' },
        transports: [
          new winston.transports.File({ filename: logFileName })
        ]
      });
    } else {
      logger = console;
    }


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
      let lDate = new Date();
      let actionUrl = `${config.okapi}/organizations-storage/interfaces/${rec.interfaceId}/credentials`;
      logger.info(`[${x}] ${lDate} POST ${rec.id} to ${actionUrl}`);
      let recUrl = `${actionUrl}/${rec.id}`;
      try {
        await superagent
          .post(actionUrl)
          .send(rec)
          .set('x-okapi-token', config.token)
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
            .set('x-okapi-token', config.token)
            .set('content-type', 'application/json')
            .set('accept', 'text/plain');
          logger.info(`    Successfully updated record id ${rec.id}`);
          updated++;
        } catch (e) {
          logger.error(`     ERROR ${rec.id}: ${e}`);
	  fs.writeFileSync(errPath, `${line}\n`, { flag: 'a'});
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
