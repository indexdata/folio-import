/*
  This script will load entitlements (agreement lines) matched on the agreement name.

  Since we can't force an agreement id (mod-agreements assigns its own), we neet to match
  on another field-- this being the unique name.  

  The input file must be in the format of an entitlement, but instead of a UUID for owner,
  use the parent agreement name.

  Here is an example for an entitlement that gets attached to the "Kanopy" agreement:

  {
  "owner": "Kanopy",
  "type": "detached",
  "suppressFromDiscovery": false,
  "desciption": "Giroux: Culture, Politics, and Pedagogy",
  "activeFrom": "2015-04-23",
  "activeTo": "2016-04-23",
  "note": "This is a note field."
}

*/

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
      throw new Error('Usage: node loadEntitlements.js <jsonl_file> [ <limit> ]');
    } else if (!fs.existsSync(inFile)) {
      throw new Error('Can\'t find input file');
    } 
    const config = (fs.existsSync('./config.js')) ? require('./config.js') : require('./config.default.js');

    let limit = (process.argv[3]) ? parseInt(process.argv[3], 10) : 10000000;
    if (isNaN(limit)) {
      throw new Error('Limit must be a number.');
    }

    const workingDir = path.dirname(inFile);
    const baseName = path.basename(inFile, '.jsonl');
    const errPath = `${workingDir}/${baseName}Err.jsonl`;
    if (fs.existsSync(errPath)) {
      fs.unlinkSync(errPath);
    }
    
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

    const authToken = await getAuthToken(superagent, config.okapi, config.tenant, config.authpath, config.username, config.password);

    const searchUrl = `${config.okapi}/erm/sas?match=name&perPage=100&term=`;
    let success = 0;
    let fail = 0;

    const fileStream = fs.createReadStream(inFile);

    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });

    let x = 0;
    const agreementMap = {};
    for await (const line of rl) {
      x++;
      let rec = JSON.parse(line);
      let lDate = new Date();
      if (agreementMap[rec.owner]) {
        logger.info(`[${x}] ${lDate} INFO "${rec.owner}" already in agreementMap-- skipping search`);
      } else {
        let encodedTerm = encodeURIComponent(rec.owner);
        let agreementUrl = searchUrl + encodedTerm;
        logger.info(`[${x}] ${lDate} GET ${agreementUrl}`);
        try {
          let res = await superagent
            .get(agreementUrl)
            .set('x-okapi-token', authToken)
            .set('accept', 'application/json');
          if (res.body.length > 0) {
            res.body.forEach(a => {
              if (a.name = rec.owner) {
                agreementMap[a.name] = a.id; 
              }
            });
          }
        } catch (e) {
          logger.error(`ERROR ${e}`);
        }
      } 

      if (agreementMap[rec.owner]) {
        let ownerId = agreementMap[rec.owner];
        const actionUrl = `${config.okapi}/erm/entitlements`;
        logger.info(`[${x}] ${lDate} POST Adding entitlment ${rec.id} to "${rec.owner}"`);
        rec.owner = ownerId;
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
          logger.error(`ERROR ${errMsg}`);
          fail++;
        }
      }
      if (x === limit) break;
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
