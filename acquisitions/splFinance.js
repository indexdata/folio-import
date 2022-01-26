const { group } = require('console');
const { captureRejectionSymbol } = require('events');
const fs = require('fs');
const uuid = require('uuid/v5');

const ns = 'e35dff4e-9035-4d6a-b621-3d42578f81c7';
const fyear = '2022';
const fyCode = 'FY' + fyear;
const inFiles = {
  funds: 'budget_heirarchy.json'
};


(async () => {
  try {
    let dir = process.argv[2];
    if (!dir) {
      throw 'Usage: node splFinance.js <data_dir>';
    } else if (!fs.existsSync(dir)) {
      throw new Error('Can\'t find input directory');
    }

    dir = dir.replace(/\/$/, '');
    const hz = {};
    for (let f in inFiles) {
      let inFile = dir + '/' + inFiles[f];
      if (!fs.existsSync(inFile)) {
        throw new Error(`Can\'t find ${f} file at ${inFile}`);
      }
      console.log(`Loading Horizon ${f}...`);
      hz.funds = require(inFile);
    }

    const writeObj = (fn, data) => {
      const jsonStr = JSON.stringify(data);
      fs.writeFileSync(fn, jsonStr + '\n', { flag: 'a' });
    }

    const fyFile = dir + '/fiscal-years.jsonl';
    if (fs.existsSync(fyFile)) fs.unlinkSync(fyFile);

    const ldFile = dir + '/ledgers.jsonl';
    if (fs.existsSync(ldFile)) fs.unlinkSync(ldFile);

    const grFile = dir + '/groups.jsonl';
    if (fs.existsSync(grFile)) fs.unlinkSync(grFile);

    const fnFile = dir + '/funds.jsonl';
    if (fs.existsSync(fnFile)) fs.unlinkSync(fnFile);

    // make fiscal year object
    const fyId = uuid(fyCode, ns);
    fyObj = {
      id: fyId,
      name: 'FY ' + fyear,
      code: fyCode,
      currency: 'USD',
      periodStart: `${fyear}-01-01`,
      periodEnd: `${fyear}-12-21`,
      series: 'FY'
    };
    fyObj.description = 'Fiscal year ' + fyear;
    let fyCount = 1;
    writeObj(fyFile, fyObj);

    // make ledger
    const ldCode = 'SPL';
    const ldId = uuid(ldCode, ns);
    ldObj = {
      id: ldId,
      name: 'Spokane Public Library',
      code: ldCode,
      fiscalYearOneId: fyId,
      ledgerStatus: 'Active',
      restrictEncumbrance: true,
      restrictExpenditures: true
    }
    let ldCount = 1;
    writeObj(ldFile, ldObj);

    // make groups and funds
    grCount = 0;
    fnCount = 0;
    grSeen = {};
    fnSeen = {};
    funds = [];
    hz.funds.forEach(h => {
      let id = h.item_key.toString();
      if (!h.is_budget) {
        let group = {};
        if (!grSeen[id]) {
          group.id = uuid(id, ns);
          group.code = h.descr;
          group.name = `${h.descr} (${id})`;
          group.status = 'Active';
          writeObj(grFile, group);
          grCount++;
          grSeen[id] = group.id;
        }
      } else {
        let fund = {};
        if (!fnSeen[id]) {
          fund.id = uuid(id, ns);
          fund.code = h.descr;
          fund.ledgerId = ldId;
          fund.status = 'Active';
          writeObj(fnFile, fund);
          fnCount++;
          fnSeen[id] = fund.id;
        }
      }
    });
    // link fund to group
    

    console.log('---------------------');
    console.log('Fiscal Years:', fyCount);
    console.log('Ledgers     :', ldCount);
    console.log('Groups      :', grCount);
    console.log('Funds       :', fnCount);
  } catch (e) {
    console.log(e);
  }
})();