const fs = require('fs');
const superagent = require('superagent');
const winston = require('winston');
const readline = require('readline');
const path = require('path');

const { getAuthToken } = require('./lib/login');
let inFile = process.argv[3];
let ep = process.argv[2];
let debug = process.env.DEBUG;
let dolog = process.env.LOG;

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

    ep = ep.replace(/^_\//, '');
    ep = ep.replace(/__/g, '/');
    const workingDir = path.dirname(inFile);
    const baseName = path.basename(inFile, '.jsonl');
    const errPath = `${workingDir}/${baseName}Err.jsonl`;
    const outPath = `${workingDir}/${baseName}Out.jsonl`;
    const logPath = `${workingDir}/${baseName}.log`;
    if (fs.existsSync(errPath)) {
      fs.unlinkSync(errPath);
    }
    if (fs.existsSync(outPath)) {
      fs.unlinkSync(outPath);
    }
    
    let config = await getAuthToken(superagent);

    var logger;

    if (config.logpath || dolog) {
      const lpath = config.logpath;
      const lname = inFile.replace(/.+\//, '');
      const logFileName = (dolog) ? logPath : `${lpath}/${lname}.log`;
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
      if (rec._errMessage) delete rec._errMessage;
      if (rec.__) delete rec.__;
      let lDate = new Date();
      if (config.expiry && config.expiry <= lDate.valueOf()) {
        config = await getAuthToken(superagent);
      }
      logger.info(`[${x}] ${lDate} POST ${rec.id} to ${actionUrl}`);
      try {
        let res = await superagent
          .post(actionUrl)
          .send(rec)
          .set('x-okapi-token', config.token)
          .set('content-type', 'application/json')
          .set('accept', 'application/json');
        logger.info(`  Successfully added record id ${rec.id}`);
        console.log(res.body);
        if (actionUrl.match(/\/(erm|licenses\/)|\/notes$|\/bill$/)) {
          fs.writeFileSync(outPath, JSON.stringify(res.body) + '\n', {flag: 'a'});
        }
        success++;
      } catch (e) {
          let errMsg = (e.response && e.response.text && !debug) ? e.response.text : e;
          logger.error(errMsg);
          rec._errMessage = errMsg;
          let recStr = JSON.stringify(rec);
          fs.writeFileSync(errPath, recStr + '\n', { flag: 'a'});
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
    logger.info(`Records added:   ${success}`);
    logger.info(`Failures:        ${fail}\n`);
  } catch (e) {
    console.error(e);
  }
})();
