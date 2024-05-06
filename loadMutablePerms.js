const fs = require('fs');
const superagent = require('superagent');
const winston = require('winston');
const { getAuthToken } = require('./lib/login');
let inFile = process.argv[2];

const wait = (ms) => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

(async () => {
  try {
    const start = new Date().valueOf();
    let inData;
    if (!inFile) {
      throw new Error('Usage: node loadMutablePerms.js <mutable_perms_file> [ <limit> ]');
    } else if (!fs.existsSync(inFile)) {
      throw new Error('Can\'t find input file');
    } else {
      inData = require(inFile);
      if (inData.permissions) {
        inData = inData.permissions;
      }
    }

    let limit = (process.argv[3]) ? parseInt(process.argv[3], 10) : inData.length;

    if (isNaN(limit)) {
      throw new Error('Limit must be a number.');
    }
    
    let config = await getAuthToken(superagent);

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


    const actionUrl = config.okapi + '/perms/permissions';
    
    let success = 0;
    let updated = 0;
    let fail = 0;
    let failedRecs = { permissions: [] };
    for (let x = 0; x < limit; x++) {
      delete inData[x].childOf;
      delete inData[x].grantedTo;
      delete inData[x].dummy;
      delete inData[x].metadata;
      delete inData[x].deprecated;
      try {
        await superagent
          .post(actionUrl)
          .send(inData[x])
          .set('x-okapi-token', config.token)
          .set('content-type', 'application/json')
          .set('accept', 'application/json');
        logger.info(`Successfully added mutable permission ${inData[x].displayName}`);
        success++
      } catch (e) {
        logger.error(e.response.error.text);
        fail++;
      }
      await wait(config.delay);
    } 
    if (config.logpath && failedRecs.permissions[0]) {
      let rfname = lname.replace(/\.json$/, '');
      fs.writeFileSync(`${lpath}/${rfname}_err.json`, JSON.stringify(failedRecs, null, 2));
    }
    const end = new Date().valueOf();
    const ms = end - start;
    const time = Math.floor(ms / 1000);
    logger.info(`\nTime:          ${time} sec`);
    logger.info(`Records added:   ${success}`);
    logger.info(`Records updated: ${updated}`);
    logger.info(`Failures:        ${fail}\n`);
  } catch (e) {
    console.log(e.message);
  }
})();
