const fs = require('fs');
const readline = require('readline');
const uuid = require('uuid/v5');
const path = require('path');

const ns = 'e35dff4e-9035-4d6a-b621-3d42578f81c7';
const nullns = '00000000-0000-0000-0000-000000000000';
const prefix = 'inv';
const linePrefix = 'invl';

let refDir = process.argv[2];
let ordersDir = process.argv[3];
const inFile = process.argv[4];

const files = {
  iv: 'folio-invoices.jsonl',
  ivl: 'folio-invoice-lines.jsonl',
  trans: 'invoice-transactions.jsonl',
  summ: 'invoice-summaries.jsonl'
}

const refFiles = {
  organizations: 'organizations.json',
  funds: 'funds.json',
  batchGroups: 'batch-groups.json'
};

const orderFiles = {
  orderLines: 'po-lines.jsonl',
  transactions: 'transactions.jsonl'
};

(async () => {
  try {
    if (!inFile) throw('Usage: node hcInvoices.js <acq_ref_dir> <orders_dir> <sierra_invoices_json_file>');
    if (!fs.existsSync(inFile)) throw new Error(`Can't find ${inFile}!`);
    refDir = refDir.replace(/\/$/, '');
    ordersDir = ordersDir.replace(/\/$/, '');

    const dir = path.dirname(inFile);
    const fn = path.basename(inFile, '.jsonl');

    for (let n in files) {
      files[n] = dir + '/' + files[n];
      if (fs.existsSync(files[n])) fs.unlinkSync(files[n]);
    }

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

    const orders = {};
    for (let prop in orderFiles) {
      refData[prop] = {};
      let path = `${ordersDir}/${orderFiles[prop]}`;
      const fileStream = fs.createReadStream(path);
      const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
      });
      orders[prop] = {};
      console.log(`Mapping ${prop}...`);
      for await (const line of rl) {
        let l = JSON.parse(line);
        if (prop === 'orderLines') {
          let k = l.poLineNumber.replace(/-.+/, '');
          orders[prop][k] = l.id;
        } else {
          let k = l.encumbrance.sourcePoLineId;
          orders[prop][k] = l.id;
        }
      }
    }

    const writeJsonl = (path, data) => {
      let jsonStr = JSON.stringify(data) + '\n';
      fs.writeFileSync(path, jsonStr, { flag: 'a' });
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
        sol.forEach((l, el) => {
          let slid = l.id;
          let ivlId = uuid(linePrefix + slid, ns);
          let fdist = {
            code: fundCode,
            fundId: fundId,
            invoiceLineId: ivlId,
            distributionType: 'percentage',
            value: 100
          };

          let num = el + 1;
          
          let ivl = {
            invoiceLineNumber: num.toString(),
            id: ivlId,
            invoiceId: invoiceId,
            description: l.title,
            invoiceLineStatus: iv.status,
            quantity: l.noOfCopies,
            releaseEncumbrance: true,
            subTotal: l.paidAmount,
            total: l.paidAmount,
            fundDistributions: [ fdist ]
          };
          let poLineNum = l.order.replace(/.+\//, '');
          let poLineId = orders.orderLines[poLineNum];
          if (poLineId) ivl.poLineId = poLineId;
          if (l.lineItemNote) notes.push(l.lineItemNote);
          writeJsonl(files.ivl, ivl);
          lcount++;
        });

        if (notes[0]) {
          iv.note = notes.join(' ; ');
        } 
    
        // console.log(JSON.stringify(iv, null, 2));
        writeJsonl(files.iv, iv);
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