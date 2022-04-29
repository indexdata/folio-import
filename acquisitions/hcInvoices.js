const fs = require('fs');
const readline = require('readline');
const uuid = require('uuid/v5');
const path = require('path');

const ns = 'e35dff4e-9035-4d6a-b621-3d42578f81c7';
const nullns = '00000000-0000-0000-0000-000000000000';
const prefix = 'inv';
const linePrefix = 'invl';

let refDir = process.argv[2];
const inFile = process.argv[3];

const refFiles = {
  organizations: 'organizations.json',
  funds: 'funds.json',
  batchGroups: 'batch-groups.json'
};

(async () => {
  try {
    if (!inFile) throw('Usage: node hcInvoices.js <acq_ref_dir> <sierra_invoices_json_file>');
    if (!fs.existsSync(inFile)) throw new Error(`Can't find ${inFile}!`);
    refDir = refDir.replace(/\/$/, '');

    const dir = path.dirname(inFile);
    const fn = path.basename(inFile, '.jsonl');

    const outFile = `${dir}/folio-${fn}.jsonl`;
    if (fs.existsSync(outFile)) fs.unlinkSync(outFile);

    const lineFile = `${dir}/folio-line-${fn}.jsonl`;
    if (fs.existsSync(lineFile)) fs.unlinkSync(lineFile);


    const refData = {};
    for (let prop in refFiles) {
      refData[prop] = {};
      let path = `${refDir}/${refFiles[prop]}`;
      let obj = require(path);
      console.log(`Mapping ${prop}...`);
      obj[prop].forEach(p => {
        let code = p.code || p.name;
        refData[prop][code] = p.id;
      })
    }

    const fileStream = fs.createReadStream(inFile);

    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });

    let c = 0;
    let lnum = 0;
    let fail = 0;
    let lcount = 0;
    for await (const line of rl) {
      lnum++;
      try {
        let so = JSON.parse(line);
        let sid = so.id.toString();
        let invoiceId = uuid(prefix + sid, ns);
        let venCode = so.vendors[0].vendorCode.trim();
        let orgId = refData.organizations[venCode];
        if (!orgId) throw(`WARN organization not found for vendorCode "${venCode}" (${sid})`);
        let iv = {
          id: invoiceId,
          batchGroupId: refData.batchGroups.FOLIO,
          currency: 'USD',
          invoiceDate: so.invDate,
          vendorInvoiceNo: so.invNum,
          vendorId: orgId,
          source: 'User'
        };
        if (so.paidDate) {
          iv.status = 'Paid';
          iv.paymentDate = so.paidDate;
        } else {
          iv.status = 'Open';
        }
        iv.paymentMethod = 'Other';
        let sol = so.lineItems;
        let fundCode = (sol) ? sol[0].fund : '';
        let fundId = refData.funds[fundCode];
        let tot = so.invTotal;
        if (tot.subTotal !== tot.grandTotal) {
          iv.adjustments = [];
          let props = ['shipping', 'tax', 'discountOrService'];
          props.forEach(prop => {
            let val = tot[prop];
            if (val !== 0) {
              let adj = {
                value: val,
                type: 'Amount',
                relationToTotal: 'In addition to',
                prorate: 'Not prorated',
                exportToAccounting: false,
                description: prop
              };
              if (fundId) {
                let fd = {
                  fundId: fundId,
                  code: fundCode,
                  distributionType: 'percentage',
                  value: 100
                };
                adj.fundDistributions = [ fd ];
              }
              iv.adjustments.push(adj);
            }
          });
        }

        let notes = [];
        sol.forEach(l => {
          let sid = l.id;
          let ivlId = uuid(linePrefix + sid, ns);
          let ivl = {
            id: ivlId,
            invoiceId: invoiceId,
            description: l.title,
            invoiceLineStatus: iv.status,
            quantity: l.noOfCopies,
            releaseEncumbrance: false,
            subTotal: l.paidAmount
          };
          if (l.lineItemNote) notes.push(l.lineItemNote);
          let linStr = JSON.stringify(ivl) + '\n';
          fs.writeFileSync(lineFile, linStr, { flag: 'a' });
          lcount++;
        });

        if (notes[0]) {
          iv.note = notes.join(' ; ');
        } 
    
        console.log(JSON.stringify(iv, null, 2));
        let ivStr = JSON.stringify(iv) + '\n';
        fs.writeFileSync(outFile, ivStr, { flag: 'a' });
        c++;
      } catch (e) {
        console.log(`[${lnum}] ${e}`);
        fail++;
      }
    }
    console.log('Invoices:', c);
    console.log('Line items:', lcount);
    console.log('Failed:', fail);
    console.log('Invoices saved to:', outFile);
    console.log('Line items saved to:', lineFile);
  } catch (e) {
    console.log(e);
  }
})();