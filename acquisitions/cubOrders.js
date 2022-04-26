const fs = require('fs');
const readline = require('readline');
const uuid = require('uuid/v5');
const path = require('path');

const ns = 'e35dff4e-9035-4d6a-b621-3d42578f81c7';
const unit = '24c4baf7-0653-517f-b901-bde483894fdd';  // CU Boulder

let refDir = process.argv[2];
const inFile = process.argv[3];

const refFiles = {
  organizations: 'organizations.json',
  funds: 'funds.json',
  entries: 'fund-codes.json'
};

(async () => {
  try {
    if (!inFile) throw('Usage: node cubOrders.js <acq_ref_dir> <sierra_orders_json_file>');
    if (!fs.existsSync(inFile)) throw new Error(`Can't find ${inFile}!`);
    refDir = refDir.replace(/\/$/, '');

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

    const fileStream = fs.createReadStream(inFile);

    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });

    let c = 0;
    let lnum = 0;
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
        if (!orgId) throw(`WARN no vendor code found for "${vcode}" (${poNum})`);
        let co = {
          id: poId,
          poNumber: poNum,
          vendor: orgId,
          dateOrdered: ff['13'].value,
          compositePoLines: [],
          notes: [],
          acqUnitIds: [ unit ]
        }
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
          checkinItems: false
        };
        
        pol.titleOrPackage = so.bibs[0].title;
        if (so.bibs[0].author) pol.contributors = [ so.bibs[0].author ];

        let form = ff['11'].value;
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
      }
    }
    console.log('Orders created', c);    
  } catch (e) {
    console.log(e);
  }
})();