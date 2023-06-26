const fs = require('fs');
const superagent = require('superagent');
const winston = require('winston');
const readline = require('readline');
const path = require('path');

const { getAuthToken } = require('./lib/login');
let inFile = process.argv[2];
let ep = 'circulation/requests';
let debug = process.env.DEBUG;
let dolog = process.env.LOG;

(async () => {
  try {
    const start = new Date().valueOf();
    if (!inFile) {
      throw 'Usage: node loadRequests.js <jsonl_file>';
    } else if (!fs.existsSync(inFile)) {
      throw new Error('Can\'t find input file');
    } 
    const config = (fs.existsSync('./config.js')) ? require('./config.js') : require('./config.default.js');

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

    const postReq = async (actionUrl, rec, x) => {
      let lDate = new Date();
      logger.info(`[${x}] ${lDate} POST ${rec.id} to ${actionUrl}`);
      try {
        let res = await superagent
          .post(actionUrl)
          .send(rec)
          .set('x-okapi-token', authToken)
          .set('content-type', 'application/json')
          .set('accept', 'application/json');
        logger.info(`  Successfully added record id ${rec.id}`);
      } catch (e) {
        let errMsg = (e.response && e.response.text && !debug) ? e.response.text : e;
        console.log(errMsg);
        if (errMsg.match(/Hold\/Recall/)) {
          logger.warn(`  WARN Hold/Recall type request failed, retrying as Page...`)
          rec.requestType = 'Page';
          console.log(rec);
          await postReq(actionUrl, rec, x);
        } else if (errMsg.match(/Page/)) { 
          logger.warn(`  WARN Page type request failed, trying as Hold...`)
          rec.requestType = 'Hold';
          await postReq(actionUrl, rec, x)
        } else {
          throw new Error(errMsg);
        }
      }
    }

    const authToken = await getAuthToken(superagent, config.okapi, config.tenant, config.authpath, config.username, config.password);

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
      try {
        await postReq(actionUrl, rec, x);
        success++;
      } catch (e) {
          logger.error(`${e}`);
          fs.writeFileSync(errPath, line + '\n', { flag: 'a'});
          fail++;
      }
    }
    const end = new Date().valueOf();
    const ms = end - start;
    const time = Math.floor(ms / 1000);
    logger.info(`Time:            ${time} sec`);
    logger.info(`Records added:   ${success}`);
    logger.info(`Failures:        ${fail}`);
  } catch (e) {
    console.error(e);
  }
})();
