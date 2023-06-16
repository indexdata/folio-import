const fs = require('fs');
const readline = require('readline');
const path = require('path');
const uuid = require('uuid/v5');

let fy = process.argv[2];
let fyId = process.argv[3];
let inFile = process.argv[4];
let ns = 'ff67f961-a651-4353-b49f-182d50ae7850';

(async () => {
  try {
    const start = new Date().valueOf();
    if (!inFile) {
      throw 'Usage: node resetBudget.js <fiscal_year> <fiscal_year_uuid> <jsonl_file>';
    } else if (!fs.existsSync(inFile)) {
      throw new Error('Can\'t find input file');
    } 

    const workingDir = path.dirname(inFile);
    const baseName = path.basename(inFile, '.jsonl');
    const outPath = `${workingDir}/${baseName}_reset.jsonl`;
    if (fs.existsSync(outPath)) {
      fs.unlinkSync(outPath);
    }
    const gpath = `${workingDir}/${baseName}_gfy.jsonl`;
    if (fs.existsSync(gpath)) {
      fs.unlinkSync(gpath);
    }

    const gf = require(`${workingDir}/finance-storage__group-fund-fiscal-years.json`);
    const gmap = {};
    gf.groupFundFiscalYears.forEach(g =>{
      if (!gmap[g.fundId]) gmap[g.fundId] = []
      gmap[g.fundId].push(g.groupId);
    });
    // console.log(gmap); return;
    
    const fileStream = fs.createReadStream(inFile);

    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });

    let x = 0;
    let c = 0;
    for await (const line of rl) {
      let rec = JSON.parse(line);
      rec.name = rec.name.replace(/(^.+-).+$/, '$1' + fy);
      rec._version = 1;
      rec.id = uuid(rec.name, ns);
      rec.fiscalYearId = fyId;
      rec.expenditures = 0;
      rec.encumbered = 0;
      rec.unavailable = 0;
      rec.overEncumbrance = 0;
      rec.overExpended = 0;
      rec.allocated = rec.initialAllocation;
      rec.available = rec.initialAllocation;
      rec.cashBalance = rec.available;
      fs.writeFileSync(outPath, JSON.stringify(rec) + '\n', { flag: 'a' });

      let gids = (gmap[rec.fundId]) ? gmap[rec.fundId] : [];
      if (gids && gids[0]) {
        gids.forEach(gid => {
          let gfy = {
            _version: 1,
            id: uuid(gid + rec.fundId, ns),
            budgetId: rec.id,
            fundId: rec.fundId,
            groupId: gid,
            fiscalYearId: rec.fiscalYearId
          }
          fs.writeFileSync(gpath, JSON.stringify(gfy) + '\n', { flag: 'a'});
        });
      }
      c++
    }
    console.log(`${c} budgets reset and saved to ${outPath}`);
  } catch (e) {
    console.error(e);
  }
})();
