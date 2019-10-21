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
      throw new Error('Usage: node loadNotes.js <notes_file> [ <limit> ]');
    } else if (!fs.existsSync(inFile)) {
      throw new Error('Can\'t find input file');
    } else {
      inData = require(inFile);
      if (inData.notes) {
        inData = inData.notes;
      }
    }
    const config = (fs.existsSync('./config.js')) ? require('./config.js') : require('./config.default.js');

    let limit = (process.argv[3]) ? parseInt(process.argv[3], 10) : inData.length;

    if (isNaN(limit)) {
      throw new Error('Limit must be a number.');
    }

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

    const actionUrl = config.okapi + '/notesx';
    
    let success = 0;
    let updated = 0;
    let fail = 0;
    let failedRecs = { notes: [] };
    for (let x = 0; x < limit; x++) {
      try {
        await superagent
          .post(actionUrl)
          .send(inData[x])
          .set('x-okapi-token', authToken)
          .set('content-type', 'application/json')
          .set('accept', 'application/json');
        logger.info(`Successfully added note to ${inData[x].links[0].type} ${inData[x].links[0].id}`);
        success++
      } catch (e) {
        try {
          await superagent
            .put(`${actionUrl}/${inData[x].id}`)
            .send(inData[x])
            .set('x-okapi-token', authToken)
            .set('content-type', 'application/json')
            .set('accept', 'text/plain');
          logger.info(`Successfully updated note for ${inData[x].links[0].type} ${inData[x].links[0].id}`);
          updated++
        } catch (e) {
          logger.error(e.response.text);
          failedRecs.notes.push(inData[x]);
          fail++;
        }
      }
      await wait(config.delay);
    }
    if (config.logpath && failedRecs.notes[0]) {
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
