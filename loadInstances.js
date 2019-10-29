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
      throw new Error('Usage: node loadInstances.js <instances_file> [ <limit> ]');
    } else if (!fs.existsSync(inFile)) {
      throw new Error('Can\'t find input file');
    } else {
      const inst = require(inFile);
      inData = inst.instances;
    }
    const config = (fs.existsSync('./config.js')) ? require('./config.js') : require('./config.default.js');

    let limit = (process.argv[3]) ? parseInt(process.argv[3], 10) : inData.length;
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

    const actionUrl = config.okapi + '/instance-storage/instances';

    let updated = 0;
    let success = 0;
    let fail = 0;
    for (let x = 0; x < limit; x++) {
      let recUrl = config.okapi + '/instance-storage/instances' + inData[x].id;
      try {
        await superagent
          .post(actionUrl)
          .send(inData[x])
          .set('x-okapi-token', authToken)
          .set('content-type', 'application/json')
          .set('accept', 'application/json');
        logger.info(`Successfully added record id ${inData[x].id}`);
        success++;
      } catch (e) {
        try {
          await superagent
            .put(recUrl)
            .send(inData[x])
            .set('x-okapi-token', authToken)
            .set('content-type', 'application/json');
          logger.info(`Successfully updated record id ${inData[x].id}`);
          updated++;
        } catch (e) {
          logger.error(`${inData[x].id}: ${e.response.text}`);
          fail++;
        }
      }
      await wait(config.delay);
    }
    const end = new Date().valueOf();
    const ms = end - start;
    const time = Math.floor(ms / 1000);
    logger.info(`\nTime:            ${time} sec`);
    logger.info(`Records updated: ${updated}`);
    logger.info(`Records added:   ${success}`);
    logger.info(`Failures:        ${fail}\n`);
  } catch (e) {
    console.error(e.message);
  }
})();
