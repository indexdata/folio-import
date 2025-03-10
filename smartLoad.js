const fs = require('fs');
const superagent = require('superagent');
const winston = require('winston');
const readline = require('readline');
const path = require('path');

const { getAuthToken } = require('./lib/login');
let inFile = process.argv[2];

const wait = (ms) => {
  console.log(`(Waiting ${ms}ms...)`);
  return new Promise((resolve) => setTimeout(resolve, ms));
};

(async () => {
  try {
    const start = new Date().valueOf();
    if (!inFile) {
      throw 'Usage: node smartLoad.js <jsonl_file> [ <limit> ]';
    } else if (!fs.existsSync(inFile)) {
      throw new Error('Can\'t find input file');
    } 

    let limit = (process.argv[4]) ? parseInt(process.argv[4], 10) : 10000000;
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
      if (config.expiry && config.expiry <= lDate.valueOf()) {
        config = await getAuthToken(superagent);
      }
      let ep;
      if (rec.periodStart && rec.periodEnd) {
          ep = 'finance-storage/fiscal-years';
      } else if (rec.ledgerStatus) {
          ep = 'finance-storage/ledgers';
      } else if (rec.fundStatus) {
          ep = 'finance-storage/funds';
      } else if (rec.budgetStatus) {
          ep = 'finance-storage/budgets';
      } else if (rec.transactionType) {
          ep = 'finance-storage/transactions';
      } else if (rec.numPendingPayments || rec.numPaymentsCredits) {
          ep = 'finance-storage/invoice-transaction-summaries';
      } else if (rec.numTransactions) {
          ep = 'finance-storage/order-transaction-summaries';
      } else if (inFile.match(/groups/i) && rec.status && rec.code && rec.name) {
          ep = 'finance-storage/groups';
      } else if (rec.fiscalYearId && rec.groupId && rec.fundId) {
          ep = 'finance-storage/group-fund-fiscal-years';
      } else if (rec.budgetId && rec.expenseClassId) {
          ep = 'finance-storage/budget-expense-classes';
      } else if (rec.feeFineId && rec.paymentStatus) {
        ep = 'accounts';
      } else if (rec.holdingsRecordId && rec.materialTypeId) {
          ep = 'item-storage/items';
      } else if (rec.instanceId && rec.permanentLocationId) {
          ep = 'holdings-storage/holdings';
      } else if (rec.instanceTypeId && rec.source) {
          ep = 'instance-storage/instances';
      } else if (rec.externalIdsHolder) {
          ep = 'source-storage/records';
      } else if (rec.jobExecutionId) {
          ep = 'source-storage/snapshots';
      } else if (rec.userId && rec.permissions) {
          ep = 'perms/users';
      } else if (rec.patronGroup && rec.personal) {
          ep = 'users';
      } else if (rec.succeedingInstanceId || rec.precedingInstanceId) {
          ep = 'preceding-succeeding-titles';
      } else if (rec.superInstanceId) {
          ep = 'instance-storage/instance-relationships';
      } else if (rec.compositePoLines) {
          ep = 'orders/composite-orders';
      } else if (rec.poNumber && rec.workflowStatus) {
          ep = 'orders-storage/purchase-orders';
      } else if (rec.titleOrPackage && rec.purchaseOrderId) {
          ep = 'orders-storage/po-lines';
      } else if (inFile.match(/organizations.jsonl/)) {
          ep = 'organizations-storage/organizations';
      } else if (inFile.match(/contacts.jsonl/)) {
          ep = 'organizations-storage/contacts';
      } else if (inFile.match(/interfaces.jsonl/)) {
          ep = 'organizations-storage/interfaces';
      } else if (rec.batchGroupId && rec.invoiceDate) {
          ep = 'invoice-storage/invoices';
      } else if (rec.invoiceLineStatus) {
          ep = 'invoice-storage/invoice-lines';
      } else if (rec.itemId && rec.userId && rec.loanDate) {
          ep = 'loan-storage/loans';
      } else if (rec.content && rec.domain && rec.links) {
          ep = 'notes';
      } else if (rec.userId && rec.hasOwnProperty('holdShelf') && rec.hasOwnProperty('delivery')) {
          ep = 'request-preference-storage/request-preference';
      } else {
        throw new Error(`Endpoint not found for ${line}`);
      }
      let actionUrl = `${config.okapi}/${ep}`;
      logger.info(`[${x}] ${lDate} POST ${rec.id} to ${actionUrl}`);
      let recUrl = (actionUrl.match(/mapping-rules/)) ? actionUrl : `${actionUrl}/${rec.id}`;
      if (rec.__) delete rec.__;
      if (rec.errMessage) delete rec.errMessage;
      try {
	      if (process.env.PUT_ONLY) throw 'INFO -- PUT requests only';
        await superagent
          .post(actionUrl)
          .send(rec)
          .set('x-okapi-token', config.token)
          .set('content-type', 'application/json')
          .set('accept', 'application/json');
        logger.info(`  Successfully added record id ${rec.id}`);
        success++;
      } catch (e) {
	      let errMsg = (e.response) ? e.response.text : e;
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
      if (config.delay) {
        await wait(config.delay);
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
