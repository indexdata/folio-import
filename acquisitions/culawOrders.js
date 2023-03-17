const fs = require('fs');
const readline = require('readline');
const uuid = require('uuid/v5');
const path = require('path');

let startDate = '2022-07-01';
const ns = '539a898e-9b0c-449f-a1c6-9483ea7279c6';
const nullns = '00000000-0000-0000-0000-000000000000';
const unit = '04fbd113-822b-49cf-bde0-cde66db437ad';  // CU Boulder
const ver = '1';

let refDir = process.argv[2];
const inFile = process.argv[3];

const refFiles = {
  organizations: 'organizations.json',
  funds: 'funds.json',
  entries: 'fund-codes.json',
  locations: 'locations.json',
  acquisitionMethods: 'acquisition-methods.json',
  mtypes: 'material-types.json'
};

const formMap = {
  b: "book",
  e: "ejournal acq",
  k: "map",
  j: "memb acq",
  g: "cd acq",
  i: "lp",
  l: "microfilm",
  m: "microfiche",
  n: "news acq",
  o: "archival collection acq",
  p: "photograph acq",
  r: "ebook acq",
  s: "journal",
  u: "bib acq",
  w: "dvd",
  x: "db acq",
  y: "electronic resource",
  3: "score",
  4: "stream acq",
  f: "film reel"
};

(async () => {
  let startTime = new Date().valueOf();
  try {
    if (!inFile) throw('Usage: node culawOrders.js <acq_ref_dir> <orders_text_file>');
    if (!fs.existsSync(inFile)) throw new Error(`Can't find ${inFile}!`);
    refDir = refDir.replace(/\/$/, '');
    let locMapFile = `${refDir}/locations.tsv`;
    if (!fs.existsSync(locMapFile)) throw new Error(`Can't open location map file at ${locMapFile}`);

    const dir = path.dirname(inFile);
    const fn = path.basename(inFile, '.jsonl');
    const outFile = `${dir}/folio-${fn}.jsonl`;
    if (fs.existsSync(outFile)) fs.unlinkSync(outFile);

    const refData = {};
    for (let prop in refFiles) {
      refData[prop] = {};
      let path = `${refDir}/${refFiles[prop]}`;
      let obj = require(path);
      console.log(`Mapping ${prop}...`);
      obj[prop].forEach(p => {
        let code = p.code || p.value || p.name;
        if (prop === 'mtypes') {
          code = code.toLowerCase();
        }
        code = code.trim();
        if (prop === 'entries') {
          let codeNum = `${p.codeNumber}`;
          codeNum = codeNum.padStart(5, '0');
          refData[prop][codeNum] = refData.funds[code];
        } else {
          refData[prop][code] = p.id;
        }
      })
    }

    const locMap = {};
    let locData = fs.readFileSync(locMapFile, { encoding: 'utf8' });
    locData.split(/\n/).forEach(line => {
      let [k, v] = line.split(/\t/);
      k = k.trim();
      v = v.trim();
      v = v.replace(/^.+\//, '');
      locMap[k] = refData.locations[v];
    });
    locMap['unmapped'] = refData.locations['UNMAPPED'];

    const fileStream = fs.createReadStream(inFile);

    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });

    let nfields = ['NOTE(ORDER)', 'MESSAGE', 'TICKLER'];
    let c = 0;
    let lnum = 0;
    let fail = 0;
    let skipped = 0;
    let head;
    for await (let line of rl) {
      try {
        lnum++;
        line = line.replace(/^"|"$/g, '');
        let cols = line.split(/""/);
        let so = {};
        if (lnum === 1) {
          head = cols;
          console.log(head);
        } else {
          head.forEach((h, i) => {
            so[h] = cols[i];
          });

          let poNum = (so['RECORD #(ORDER)']) ? 'l' + so['RECORD #(ORDER)'] : '';
          let poId = uuid(poNum, ns);
          let vend = so.VENDOR.replace(/^l([^-])/, 'l-$1');
          let orgId = refData.organizations[vend];
          if (!orgId) throw new Error(`No vender ID found for ${vend}`);
          let created = so.ODATE;
          if (created.match(/\d/)) {
            created = created.replace(/(..-..)-(....)/, '$2-$1');
          } else {
            created = '2000-01-01';
          }
          let otype = so['ORD TYPE'];
          
          let status = 'hey';
          let co = {
            id: poId,
            poNumber: poNum,
            vendor: orgId,
            dateOrdered: created,
            compositePoLines: [],
            notes: [],
            acqUnitIds: [ unit ]
          }
          nfields.forEach(f => {
            if (so[f]) {
              let notes = so[f].split(/";"/);
              notes.forEach(n => {
                co.notes.push(n);
              });
            }
          });

          console.log(co);

          // co.orderType = orderType;
          if (co.orderType === 'Ongoing') {
            co.ongoing = {
              interval: 365,
              isSubscription: true,
              renewalDate: co.dateOrdered
            };
          }
          
          co.workflowStatus = status;

          // PO lines start here

          let pol = {
            paymentStatus: 'Awaiting Payment',
            poLineNumber: poNum + '-1',
            source: 'User',
            checkinItems: false,
            locations: []
          };
        }
      } catch (e) {
        console.log(`[${lnum}] ${e}`);
        fail++;
      }
    }
    const endTime = new Date().valueOf();
    const ttime = (endTime - startTime)/1000;
    console.log('Total time (seconds)', ttime);
    console.log('Orders created', c);
    console.log('Orders failed', fail);
    console.log('Orders skipped', skipped);
  } catch (e) {
    console.log(e);
  }
})();