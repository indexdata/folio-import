const fs = require('fs');
const superagent = require('superagent');
const winston = require('winston');
const readline = require('readline');
const path = require('path');

const { getAuthToken } = require('./lib/login');
let inFile = process.argv[3];
let ep = process.argv[2];
let ver = process.env.version;

const wait = (ms) => {
  console.log(`(Waiting ${ms}ms...)`);
  return new Promise((resolve) => setTimeout(resolve, ms));
};

(async () => {
  try {
    const start = new Date().valueOf();
    if (!inFile) {
      throw 'Usage: node postJSONL.js <endpoint> <jsonl_file> [ <limit> ]';
    } else if (!fs.existsSync(inFile)) {
      throw new Error('Can\'t find input file');
    } 

    let limit = (process.argv[4]) ? parseInt(process.argv[4], 10) : 10000000;
    if (isNaN(limit)) {
      throw new Error('Limit must be a number.');
    }

    ep = ep.replace(/__/g, '/');
    ep = ep.replace(/^\.x\//, '');
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

    const actionUrl = `${config.okapi}/${ep}`;
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
      if (ver) rec._version = ver;
      if (rec._errorMessage) delete rec._errorMessage;
      let id = rec.id;
      if (rec.fund && rec.fund.id) id = rec.fund.id;
      let lDate = new Date();
      if (config.expiry && config.expiry <= lDate.valueOf()) {
        config = await getAuthToken(superagent);
      }
      logger.info(`[${x}] ${lDate} PUT ${id} to ${actionUrl}`);
      let recUrl = `${actionUrl}/${id}`;
      if (recUrl.match(/instances|holdings|items/)) {
        try {
          let res = await superagent
            .get(recUrl)
            .set('x-okapi-token', config.token);
          logger.info(`  Setting version number to ${res.body._version}`);
          rec._version = res.body._version;
        } catch (e) {
          logger.error(`${e}`); 
        }
      }
      try {
        await superagent
          .put(recUrl)
          .send(rec)
          .set('x-okapi-token', config.token)
          .set('content-type', 'application/json')
          .set('accept', '*/*');
        logger.info(`  Successfully updated record id ${id}`);
        success++;
      } catch (e) {
	      let errMsg = (e.response) ? e.response.text : e;
        logger.error(errMsg);
        fail++;
      }
      if (config.delay) {
        await wait(config.delay);
      }
    }
    const end = new Date().valueOf();
    const ms = end - start;
    const time = Math.floor(ms / 1000);
    logger.info(`\nTime:            ${time} sec`);
    logger.info(`Records updated: ${success}`);
    logger.info(`Failures:        ${fail}\n`);
  } catch (e) {
    console.error(e);
  }
})();
