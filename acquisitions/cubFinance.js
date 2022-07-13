/*
  TSV Schema:
  0: acqusition unit ID
  1: acqusition unit name
  2: fiscal year name <required>
  3: fiscal year code <required>
  4: 
  5: description
  6: start date <required>
  7: end date <required>
*/

const fs = require('fs');
const readline = require('readline');
const path = require('path');
const uuid = require('uuid/v5');
const { application_name } = require('pg/lib/defaults');
const argv = require('minimist')(process.argv.slice(2));

const ns = 'e35dff4e-9035-4d6a-b621-3d42578f81c7';

let files = {
  units: 'acq-units.jsonl',
  fy: 'fiscal-years.jsonl',
  ledgers: 'ledgers.jsonl',
  groups: 'groups.jsonl',
  funds: 'funds.jsonl',
  budgets: 'budgets.jsonl',
  groupfy: 'group-fund-fiscal-year.jsonl'
};

const col = { a:0, b:1, c:2, d:3, e:4, f:5, g:6, h:7, i:8, j:9, k:10, l:11, m:12, n:13, o:14, p:15, q:16, r:17, 
  s:18, t:19, u:20, v:21, w:22, x:23, y:24, z:25, aa:26, ab:27, ac:28, ad:29, ae:30, af:31, ag:32, ah:33, ai:34, aj:35, ak:36 };

(async () => {
  try {
    const inFile = argv._[0];
    if (!inFile) {
      throw 'Usage: node cubFinance.js <fiscal_tsv_file> [ -l <ledger_tsv_file> ] [ -f funds_tsv_file ] [ -s fy_series ]';
    } else if (!fs.existsSync(inFile)) {
      throw new Error('Can\'t find input file');
    }
    const writeObj = (fn, data) => {
      const jsonStr = JSON.stringify(data);
      fs.writeFileSync(fn, jsonStr + '\n', { flag: 'a' });
    }
    const dir = path.dirname(inFile);
    
    for (let f in files) {
      let file = dir + '/' + files[f];
      if (fs.existsSync(file)) fs.unlinkSync(file);
      files[f] = file;
    }

    const fileStream = fs.createReadStream(inFile);

    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });

    let auCount = 0;
    let fyCount = 0;
    let ldCount = 0;
    let fnCount = 0;
    let bdCount = 0;
    let grCount = 0;
    let gffyCount = 0;

    const series = (argv.s) ? argv.s : 'FY';
    let fyid = '';
    let fyCode = '';
    const acqUnits = {};
    let x = 0;
    let sl = 1;
    if (argv.h) sl = 1;
    for await (const line of rl) {
      x++;
      if (x > sl) {
        let c = line.split(/\t/);
        let uname = c[1];
        if (uname && !acqUnits[uname]) acqUnits[uname] = uuid(uname, ns);
        let code = c[3];
        code = code.replace(/^[A-z]+/, '');
        code = series + code;
        fyid = uuid(code, ns);
        fyCode = code;
        let start = new Date(c[6]).toISOString();
        let end = new Date(c[7]).toISOString();
        let obj = {
          id: fyid,
          name: c[2],
          code: code,
          description: c[5],
          periodStart: start,
          periodEnd: end,
          series: series
        }
        if (acqUnits[uname]) {
          obj.acqUnitIds = [ acqUnits[uname] ];
        }
        writeObj(files.fy, obj);
        fyCount++;
      }
    }

    // create acquisitions units
    for (let u in acqUnits) {
      let obj = {};
      obj.name = u;
      obj.id = acqUnits[u];
      obj.isDeleted = false;
      writeObj(files.units, obj);
      auCount++;
    }

    // create ledgers
    const ledgerMap = {};
    if (argv.l) {
      const fileStream = fs.createReadStream(argv.l);
      const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
      });
      let x = 0;
      for await (const line of rl) {
        x++;
        if (x > sl) {
          let c = line.split(/\t/);
          let name = c[1];
          let code = c[2];
          let id = uuid(code, ns);
          ledgerMap[name] = id;
          let obj = {
            id: id,
            fiscalYearOneId: fyid,
            name: name,
            code: code,
            description: c[3],
            ledgerStatus: c[5] || 'Active',
            acqUnitIds: [ acqUnits[c[11]] ],
            restrictEncumbrance: false,
            restrictExpenditures: false
          };
          writeObj(files.ledgers, obj);
          ldCount++;
        }
      }
    }
    
    // create funds
    const groupMap = {};
    if (argv.f) {
      const fileStream = fs.createReadStream(argv.f);
      const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
      });
      let x = 0;
      for await (const line of rl) {
        x++;
        if (x > sl) {
          let c = line.split(/\t/);
          let code = c[0];
          let name = c[1];
          let ledgerName = c[11];
          let externalAccountNo = c[6];
          let id = uuid(code, ns);

          let groups = [c[col.o], c[col.p], c[col.q]];
          groups.forEach(g => {
            if (g) {
              let code = g.toLocaleLowerCase();
              code = code.replace(/\W+/g, '_');
              if (!groupMap[code]) {
                groupMap[code] = {
                  id: uuid('group' + code, ns),
                  name: g
                }
              }

              // create group fund fiscal year object
              let fyObj = {
                id: uuid(code + id, ns),
                groupId: groupMap[code].id,
                fundId: id,
                fiscalYearId: fyid
              };
              writeObj(files.groupfy, fyObj);
              gffyCount++;
            }
          });
          if (ledgerMap[ledgerName]) {
            let obj = {
              id: id,
              code: code,
              name: name,
              ledgerId: ledgerMap[ledgerName],
              acqUnitIds: [ acqUnits[c[13]] ],
              fundStatus: 'Active',
            };
            let au = c[13];
            if (au) obj.acqUnitIds = [ acqUnits[au] ];
            if (externalAccountNo) obj.externalAccountNo = externalAccountNo;
            writeObj(files.funds, obj);
            fnCount++;
            
            //create budget
            let bud = {
              id: uuid(id, ns),
              fundId: id,
              name: `${code}-${fyCode}`,
              budgetStatus: 'Active',
              fiscalYearId: fyid
            };
            let all = c[col.aj];
            if (all.match(/\d/)) {
              bud.initialAllocation = parseInt(all, 10);
            } else {
              bud.initialAllocation = 0;
            }
            if (obj.acqUnitIds) bud.acqUnitIds = obj.acqUnitIds;
            writeObj(files.budgets, bud);
            bdCount++;

          } else {
            console.log(`WARN Ledger name not found for ${code}`);
          }
        }
      }
    }

    // create groups
    for (let g in groupMap) {
      let obj = {
        id: groupMap[g].id,
        name: groupMap[g].name,
        code: g,
        status: 'Active',
      };
      writeObj(files.groups, obj);
      grCount++;
    }

    console.log('---------------------');
    console.log('Acq Units :', auCount);
    console.log('Fiscal Yrs:', fyCount);
    console.log('Ledgers   :', ldCount);
    console.log('Funds     :', fnCount);
    console.log('Budgets   :', bdCount);
    console.log('Groups    :', grCount); 
    console.log('Group FYs :', gffyCount); 
  } catch (e) {
    console.log(e);
  }
})();