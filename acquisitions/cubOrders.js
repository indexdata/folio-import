const fs = require('fs');
const readline = require('readline');
const uuid = require('uuid/v5');
const path = require('path');

const ns = 'e35dff4e-9035-4d6a-b621-3d42578f81c7';
const nullns = '00000000-0000-0000-0000-000000000000';
const unit = '24c4baf7-0653-517f-b901-bde483894fdd';  // CU Boulder
const ver = '1';

let refDir = process.argv[2];
const inFile = process.argv[3];

const refFiles = {
  organizations: 'organizations.json',
  funds: 'funds.json',
  entries: 'fund-codes.json',
  locations: 'locations.json'
};

(async () => {
  try {
    if (!inFile) throw('Usage: node cubOrders.js <acq_ref_dir> <sierra_orders_json_file>');
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
        let code = p.code;
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
      v = v.replace(/^.+\//, '');
      locMap[k] = refData.locations[v];
    });

    const fileStream = fs.createReadStream(inFile);

    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });

    let c = 0;
    let lnum = 0;
    let fail = 0;
    for await (const line of rl) {
      lnum++;
      try {
        let so = JSON.parse(line);
        let vf = (so.varFields) ? so.varFields : [];
        let ff = so.fixedFields;
        let poNum = so.id.toString();
        let poId = uuid(poNum, ns);
        let vcode = ff['22'].value || '';
        vcode = vcode.trim();
        let orgId = refData.organizations[vcode];
        if (!orgId) throw(`WARN no organizationId found for "${vcode}" (${poNum})`);
        let co = {
          id: poId,
          poNumber: poNum,
          vendor: orgId,
          dateOrdered: ff['13'].value,
          compositePoLines: [],
          notes: [],
          acqUnitIds: [ unit ]
        }
        let acqType = ff['1'].value;
        let form = ff['11'].value;
        let oType = ff['15'].value;
        let statCode = ff['20'].value;
        co.orderType = (statCode.match(/[fz]/) && oType.match(/[dnoqs]/)) ? 'Ongoing' : 'One-Time';
        if (co.orderType === 'Ongoing') {
          co.ongoing = {
            interval: 365,
            isSubscription: true,
            renewalDate: co.dateOrdered
          };
        }
        co.workflowStatus = 'Pending';

        // PO lines start here

        let pol = {
          paymentStatus: 'Awaiting Payment',
          poLineNumber: poNum + '-1',
          source: 'User',
          checkinItems: false,
          locations: []
        };

        if (oType === 'a') {
          pol.acquisitionMethod = 'Approval Plan';
        } else if (oType.match(/[ew]/)) {
          pol.acquisitionMethod = 'Demand Driven Acquisitions (DDA)';
        } else if (acqType === 'd') {
          pol.acquisitionMethod = 'Depository';
        } else if (acqType === 'e') {
          pol.acquisitionMethod = 'Exchange';
        } else if (acqType === 'g') {
          pol.acquisitionMethod = 'Gift';
        } else if (oType === '2') {
          pol.acquisitionMethod = 'Evidence Based Acquisitions (EBA)';
        } else {
          pol.acquisitionMethod = 'Purchase';
        }

        let format;
        if (form.match(/[erxy4]/)) {
          format = 'Electronic Resource';
        } else if (form.match(/[ajuz]/)) {
          format = 'Other';
        } else if (form === '2') {
          format = 'P/E Mix';
        } else {
          format = 'Physical Resource';
        }
        pol.orderFormat = format;

        let location = ff['2'].value;
        location = location.trim();
        let copies = ff['5'].value;
        copies = parseInt(copies);
        let price = ff['10'].value;
        price = parseFloat(price);

        let loc = {};
        pol.cost = {};
        pol.cost.currency = 'USD';
        if (format === 'Electronic Resource') {
          pol.cost.listUnitPriceElectronic = price;
          pol.cost.quantityElectronic = copies;
          loc.quantityElectronic = copies;
        } else {
          pol.cost.listUnitPrice = price;
          pol.cost.quantityPhysical = copies;
          loc.quantityPhysical = copies;
          pol.physical = {
            createInventory: 'None'
          }
        }

        loc.quantity = copies;
        loc.locationId = locMap[location];
        if (!loc.locationId) throw(`WARN no locationId found for "${location}"`)
        pol.locations.push(loc);

        pol.titleOrPackage = so.bibs[0].title;
        if (so.bibs[0].author) {
          let au = {
            contributor: so.bibs[0].author,
            contributorNameTypeId: '2b94c631-fca9-4892-a730-03ee529ffe2a' // personal name
          }
          pol.contributors = [ au ];
        }
        pol.publicationDate = `${so.bibs[0].publishYear}`;
        let bibId = so.bibs[0].id;
        bibId = 'b' + bibId;
        pol.instanceId = uuid(bibId + ver, nullns);

        if (form.match(/[s2lmn]/i)) {
          pol.checkinItems = true;
        }
        if (form === 'c' && oType === 'o') pol.checkinItems = true; 
        
        co.compositePoLines.push(pol);
        console.log(JSON.stringify(co, null, 2));
        let coStr = JSON.stringify(co) + '\n';
        fs.writeFileSync(outFile, coStr, { flag: 'a' });
        c++;
      } catch (e) {
        console.log(`[${lnum}] ${e}`);
        fail++;
      }
    }
    console.log('Orders created', c);
    console.log('Orders failed', fail);
  } catch (e) {
    console.log(e);
  }
})();