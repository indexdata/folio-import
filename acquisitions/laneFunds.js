/*
  This script creates funds and budgets 
*/

const fs = require('fs');
const uuid = require('uuid/v5');
const parse = require('csv-parse/lib/sync');

const ns = 'e35dff4e-9035-4d6a-b621-3d42578f81c7';
let fy = 'LANEFY2022';

let files = {
  funds: 'funds.jsonl',
  budgets: 'budgets.jsonl',
  groups: 'groups.jsonl',
  groupFy: 'group-fund-fiscal-years.jsonl'
};

let ttl = {
  funds: 0,
  budgets: 0,
  groups: 0,
  groupFy: 0
}

let refFiles = {
  acquisitionsUnits: 'units.json',
  fundTypes: 'fund-types.json',
  ledgers: 'ledgers',
  fiscalYears: 'fiscal-years.json'
};

(async () => {
  try {
    let refDir = process.argv[2];
    let dir = process.argv[3];
    if (!dir) {
      throw 'Usage: node laneFunds.js <acq_ref_dir> <finance_dir>';
    } 
    dir = dir.replace(/\/$/, '');
    refDir = refDir.replace(/\/$/, '');

    const writeObj = (fn, data) => {
      const jsonStr = JSON.stringify(data);
      fs.writeFileSync(fn, jsonStr + '\n', { flag: 'a' });
    }
    
    for (let f in files) {
      let file = dir + '/' + files[f];
      if (fs.existsSync(file)) fs.unlinkSync(file);
      files[f] = file;
    }

    const refData = {};
    for (let prop in refFiles) {
      let rfile = refDir + '/' + refFiles[prop];
      let ref = require(rfile);
      refData[prop] = {};
      ref[prop].forEach(p => {
        refData[prop][p.name] = p.id
      });
    }
    // console.log(refData); return;
    const unit = refData.acquisitionsUnits.Lane;
    let fyId = refData.fiscalYears[fy];
    let fundMap = {};
    let groups = {};

    for (let f in files) {
      let inRecs = [];
      let outFile = files[f];
      if (!f.match(/group/)) {
        let inFile = outFile.replace(/\.jsonl$/, '.csv');
        let csv = fs.readFileSync(inFile, 'utf8');
        inRecs = parse(csv, {
          columns: true,
          skip_empty_lines: true
        });
      }

      inRecs.forEach(r => {
        let obj = {};
        if (f === 'funds') {
          lcode = r['Ledger ID'];
          lid = refData.ledgers[lcode];
          ftype = r.fundType;
          ftypeId = refData.fundTypes[ftype];
          obj.code = r.Code;
          obj.id = uuid(r.Code, ns);
          obj.name = r.Name;
          obj.ledgerId = lid;
          obj.fundStatus = r['Fund status'] || 'Active';
          obj.fundTypeId = ftypeId || ftype;
          if (r.externalAccountNo) obj.externalAccountNo = r.externalAccountNo;
          obj.acqUnitIds = [ unit ];
          let groupId = uuid(r.groupCode + 'groups', ns);
          groups[r.groupCode] = groupId;
          fundMap[obj.code] = { id: obj.id, name: obj.name, groupId: groupId };
        }
        if (f === 'budgets') {
          let fcode = r['Fund Code'];
          let fund = fundMap[fcode];
          obj.id = uuid(fund.name + 'bud', ns);
          obj.name = fund.name;
          obj.budgetStatus = 'Active';
          obj.fundId = fund.id;
          obj.fiscalYearId = refData.fiscalYears[fy];
          obj.initialAllocation = parseInt(r.Current_Allocation, 10);
          let gfid = uuid(obj.id + fyId, ns);
          let groupFy = {
            id: gfid,
            budgetId: obj.id,
            fundId: obj.fundId,
            groupId: fund.groupId,
            fiscalYearId: fyId
          }
          ttl.groupFy++;
          writeObj(files.groupFy, groupFy);
        }
        ttl[f]++;
        writeObj(outFile, obj);
      });
    }
    for (code in groups) {
      if (code) {
        let g = {
          id: groups[code],
          name: code,
          code: code,
          status: 'Active',
          acqUnitIds: [ unit ]
        }
        ttl.groups++;
        writeObj(files.groups, g);
      }
    }
    console.log('Done...');
    for (t in ttl) {
      console.log(t, ttl[t]);
    }
  } catch (e) {
    console.log(e);
  }
})();