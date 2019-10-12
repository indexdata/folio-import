const fs = require('fs');
const superagent = require('superagent');
const winston = require('winston');
const JSONStream = require('JSONStream');
const es = require('event-stream');

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
    }
  
    const config = (fs.existsSync('./config.js')) ? require('./config.js') : require('./config.default.js');

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

    const runRequest = async (data) => {
      let recUrl = config.okapi + '/inventory/instances/' + data.id;
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
        try {
          await superagent
            .put(recUrl)
            .send(data)
            .set('x-okapi-token', authToken)
            .set('content-type', 'application/json');
          logger.info('Successfully updated record');
          updated++;
        } catch (e) {
          logger.error(e.response.text);
          fail++;
        }
      } 
    }

    const getStream = () => {
      const jsonData = inFile;
      const stream = fs.createReadStream(jsonData, { encoding: 'utf8' });
      const parser = JSONStream.parse('*');
      return stream.pipe(parser);
    };

    await getStream()
      .pipe(es.mapSync(async data => {
        await runRequest(data);
      }));

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
