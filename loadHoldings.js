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
      throw new Error('Usage: node loadHoldings.js <holdings_file> [ <limit> ]');
    } else if (!fs.existsSync(inFile)) {
      throw new Error('Can\'t find input file');
    } else {
      inData = require(inFile);
      if (inData.holdingsRecords) {
        inData = inData.holdingsRecords;
      }
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
    /* var locs;

    // Get a list of locations;
    const locsUrl = config.okapi + '/locations';
    logger.info(`Getting locations from ${locsUrl}`);
    try {
      const res = await superagent
        .get(locsUrl)
        .set('accept', 'application/json')
        .set('x-okapi-token', authToken);
      locs = res.body.locations;
    } catch (e) {
      logger.error(e.message);
    }
    */

    const actionUrl = config.okapi + '/holdings-storage/holdings';
    
    let success = 0;
    let updated = 0;
    let fail = 0;
    for (let x = 0; x < limit; x++) {
      /* let locId = inData[x].permanentLocationId;
      let loc = locs.filter(l => l.id === locId);
      if (loc[0] === undefined && config.locationId) {
        logger.info('INFO Using default permanentLocationId')
        inData[x].permanentLocationId = config.locationId
      } */
      try {
        await superagent
          .post(actionUrl)
          .send(inData[x])
          .set('x-okapi-token', authToken)
          .set('content-type', 'application/json')
          .set('accept', 'application/json');
        logger.info(`Successfully added holdings to ${inData[x].instanceId}`);
        success++
      } catch (e) {
        try {
          await superagent
            .put(`${actionUrl}/${inData[x].id}`)
            .send(inData[x])
            .set('x-okapi-token', authToken)
            .set('content-type', 'application/json')
            .set('accept', 'text/plain');
          logger.info(`Successfully updated ${inData[x].id}`);
          updated++
        } catch (e) {
          logger.error(e.response.text);
          fail++;
        }
      }
      await wait(config.delay);
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
