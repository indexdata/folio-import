const fs = require('fs');
const uuid = require('uuid/v5');
const path = require('path');
const { parse } = require('csv-parse/sync');

let refDir = process.argv[2];
const inFile = process.argv[3];
const ns = '2f124984-d089-462a-bcfc-db7addcc43c5';
let fy = 'FY2026';

const files = {
  funds: 'funds.jsonl',
  budgets: 'budgets.jsonl'
};

const rfiles = {
  fiscalYears: 'fiscal-years.json',
  ledgers: 'ledgers.json',
  fundTypes: 'fund-types'
};

try {
  if (!inFile) throw(`Usage: node baFunds.js <ref_dir> <funds_csv_file>`);

  const dir = path.dirname(inFile);
  refDir = refDir.replace(/\/$/, '');

  for (let f in files) {
    let fn = dir + '/' + files[f];
    if (fs.existsSync(fn)) {
      fs.unlinkSync(fn);
    }
    files[f] = fn;
  }
  // throw(files);

  const refData = {};
  for (let f in rfiles) {
    let rfile = refDir + '/' + rfiles[f];
    let rdata = require(rfile);
    refData[f] = {};
    rdata[f].forEach(r => {
      let k = r.name;
      let c = r.code;
      let v = r.id;
      if (k && v) refData[f][k] = v;
      if (c && v) refData[f][c] = v;
    });
  }
  // throw(refData);

  const writeTo = (fileName, data) => {
    let outStr = JSON.stringify(data) + '\n';
    fs.writeFileSync(fileName, outStr, { flag: 'a' });
  }

  const csv = fs.readFileSync(`${inFile}`, 'utf8');
  const inRecs = parse(csv, {
    columns: true,
    skip_empty_lines: true,
    from: 1
  });
  // throw(inRecs); 

  const seen = {};
  const ttl = { count: 0, funds: 0, budgs: 0 };
  inRecs.forEach(r => {
    ttl.count++;
    if (process.env.DEBUG) console.log(r);
    let lcode = r.ledger_code;
    let lid = refData.ledgers[lcode];
    let tcode = r.fund_type;
    let tid = refData.fundTypes[tcode];
    let id = uuid(r.fund_code, ns);
    let o = {
      id: id,
      name: r.fund_name,
      code: r.fund_code,
      ledgerId: lid,
      fundStatus: r.fund_status,
      fundTypeId: tid,
      description: r.fund_description
    }
    if (process.env.DEBUG) console.log(o);
    writeTo(files.funds, o);
    ttl.funds++;

    let fyid = refData.fiscalYears[fy];
    let bo = {
      id: uuid(o.id, ns),
      budgetStatus: 'Active',
      name: o.name,
      fundId: o.id,
      fiscalYearId: fyid,
      initialAllocation: 0,
      allocated: 0
    }
    if (process.env.DEBUG) console.log(bo);
    writeTo(files.budgets, bo);
    ttl.budgs++
  });

  console.log('Finished!');
  for (let k in ttl) {
    console.log(`${k}: `, ttl[k]);
  }
} catch (e) {
  console.log(e);
}
