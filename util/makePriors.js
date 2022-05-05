/*
  This script will take funds from finance-storage and create "prior years" funds and budgets.
*/


const uuid = require('uuid/v5');
const fs = require('fs');
const path = require('path');

const ftype = '1d489dad-a2d8-4195-80a4-8ecbc62ef74d'; // fund type ID, if different from current fund
const fyId = '56c4c465-b6b3-4976-9989-da39c96b668b'; // for creating dummy budgets

const ns = 'e3398111-2ca9-4c06-b849-7301325e0786';

const inFile = process.argv[2];

try {
  if (!inFile) {
    throw 'Usage: node makePriors.js <funds_json_file>'
  }
  let dir = path.dirname(inFile);

  let outFile = dir + '/' + 'priors.jsonl';
  if (fs.existsSync(outFile)) fs.unlinkSync(outFile);
  let budFile = dir + '/' + 'prior-budgets.jsonl';
  if (fs.existsSync(budFile)) fs.unlinkSync(budFile);

  let funds = require(inFile);
  funds.funds.forEach(f => {
    f.code = f.code + "-p";
    f.id = uuid(f.code, ns);
    f.name = f.name + ' Prior';
    if (ftype) {
      f.fundTypeId = ftype;
    }
    let bud = {
      id: uuid('bud' + f.code, ns),
      budgetStatus: 'Active',
      name: f.code,
      fundId: f.id,
      fiscalYearId: fyId
    };
    
    
    console.log(f);
    let fStr = JSON.stringify(f) + '\n';
    fs.writeFileSync(outFile, fStr, { flag: 'a' });
    let budStr = JSON.stringify(bud) + '\n';
    fs.writeFileSync(budFile, budStr, { flag: 'a' });

  });
  
} catch (e) {
  console.error(e);
}