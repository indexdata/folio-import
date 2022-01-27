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
let files = {
  units: 'acq-units.jsonl',
  fy: 'fiscal-years.jsonl',
  ledgers: 'ledgers.jsonl',
  groups: 'groups.jsonl',
  funds: 'funds.jsonl',
  groupfy: 'group-fund-fiscal-year.jsonl',
  budget: 'budgets.jsonl'
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

    for (let f in files) {
      let file = dir + '/' + files[f];
      if (fs.existsSync(file)) fs.unlinkSync(file);
      files[f] = file;
    }

    const writeObj = (fn, data) => {
      const jsonStr = JSON.stringify(data);
      fs.writeFileSync(fn, jsonStr + '\n', { flag: 'a' });
    }

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
    writeObj(files.fy, fyObj);

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
    writeObj(files.ledgers, ldObj);

    // make groups and funds
    let grCount = 0;
    let fnCount = 0;
    let fgCount = 0;
    const grSeen = {};
    const fnSeen = {};
    const groupMap = {};
    const fundMap = {};
    hz.funds.forEach(h => {
      let id = h.item_key.toString();
      if (!h.is_budget) {
        let group = {};
        if (!grSeen[id]) {
          group.id = uuid(id, ns);
          group.code = h.descr;
          group.name = `${h.descr} (${id})`;
          group.status = 'Active';
          writeObj(files.groups, group);
          grCount++;
          grSeen[id] = group.id;
          groupMap[id] = group.id;
        }
      } else {
        let fund = {};
        let budget = {};
        if (!fnSeen[id]) {
          fund.id = uuid(id, ns);
          fund.code = h.descr;
          fund.name = h.descr;
          fund.ledgerId = ldId;
          fund.fundStatus = 'Active';
          writeObj(files.funds, fund);
          fnCount++;
          fnSeen[id] = fund.id;
          fundMap[fund.id] = h.parent_item_key;

          // create budget
          budget.id = uuid('budget' + id, ns);
          budget.name = h.descr;
          budget.budgetStatus = 'Active';
          budget.fundId = fund.id;
          budget.fiscalYearId = fyId;
          budget.initialAllocation = 10000;
          writeObj(files.budget, budget);
        }
      }
    });

    // create group fund fiscal year object
    for (let f in fundMap) {
      let parent = fundMap[f];
      let fyObj = {
        id: uuid(f, ns),
        groupId: groupMap[parent],
        fundId: f,
        fiscalYearId: fyId
      };
      console.log(fyObj);
      writeObj(files.groupfy, fyObj);
      fgCount++;
    }
    

    console.log('---------------------');
    console.log('Fiscal Years  :', fyCount);
    console.log('Ledgers       :', ldCount);
    console.log('Groups        :', grCount);
    console.log('Funds         :', fnCount);
    console.log('Fund Group FY :', fnCount);
  } catch (e) {
    console.log(e);
  }
})();