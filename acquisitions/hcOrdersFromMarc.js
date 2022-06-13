const fs = require('fs');
const readline = require('readline');
const uuid = require('uuid/v5');
const path = require('path');

const ns = '99a9c2f6-fae0-4f49-b242-63fd3661a7d6';

let refDir = process.argv[2];
const inFile = process.argv[3];
let fy = parseInt(process.argv[4], 10) || 2021;
let curFyStart = '2021-07';
// let fyMax = fy + 1;
// const wfs = process.argv[4] || '';

const files = {
  po: 'closed-purchase-orders.jsonl',
  pol: 'closed-po-lines.jsonl',
  co: 'open-composite-orders.jsonl',
  trans: 'closed-transactions.jsonl',
  summ: 'closed-summaries.jsonl',
  log: 'process.log'
}

const refFiles = {
  organizations: 'organizations.json',
  funds: 'funds.json',
  locations: 'locations.json',
  fiscalYears: 'fiscal-years.json'
};

const addresses = {
  a: 'b6c5f084-9faa-4c19-b4f0-d727f86f0dbf',
  p: '6daaa46d-7fb8-4061-9779-b2bb971246df'
};

const methodMap = {
  e: 'Exchange',
  g: 'Gift',
  p: 'Purchase',
  d: 'Purchase',
  r: 'Purchase'
};

(async () => {
  try {
    let start = new Date().valueOf();
    if (!inFile) throw('Usage: node hcOrders.js <acq_ref_dir> <marc_jsonl_file> [ fiscal_year_starting ]');
    if (!fs.existsSync(inFile)) throw new Error(`Can't find ${inFile}!`);
    refDir = refDir.replace(/\/$/, '');
    
    const dir = path.dirname(inFile);
    const fn = path.basename(inFile, '.jsonl', '.json');

    for (let n in files) {
      files[n] = dir + '/' + files[n]; 
      if (fs.existsSync(files[n])) fs.unlinkSync(files[n]);
    }

    const bibMapFile = `${refDir}/bibs.map`;
    if (!fs.existsSync(bibMapFile)) throw new Error(`Can't find bib map at ${bibMapFile}`);

    console.log('Creating bib map (this may take a while...)');
    const mapStream = fs.createReadStream(bibMapFile);

    const mrl = readline.createInterface({
      input: mapStream,
      crlfDelay: Infinity
    });

    let mc = 0;
    const bibMap = {};
    for await (const line of mrl) {
      let d = line.split(/\|/);
      bibMap[d[0]] = d[1];
      mc++;
      if (mc % 100000 === 0) console.log(` ${mc} map lines read...`);
    }
    console.log(`Done! ${mc} map lines read`);

    const refData = {};
    for (let prop in refFiles) {
      refData[prop] = {};
      let path = `${refDir}/${refFiles[prop]}`;
      let obj = require(path);
      console.log(`Mapping ${prop}...`);
      obj[prop].forEach(p => {
        let code = p.code;
        refData[prop][code] = p.id
      })
    }

    const parseMarc = (marc) => {
      let fo = {};
      marc.fields.forEach(f => {
        for (let tag in f) {
          if (!fo[tag]) fo[tag] = [];
          fo[tag].push(f[tag]);
        }
      });
      return fo;
    }

    const parseField = (field) => {
      let fo = {};
      if (field.subfields) {
        fo.ind1 = field.ind1;
        fo.ind2 = field.ind2;
        field.subfields.forEach(s => {
          for (let c in s) {
            if (!fo[c]) fo[c] = [];
            fo[c].push(s[c]);
          }
        });
      } else {
        fo.data = field;
      }
      return fo;
    }

    const fieldToString = (field, subFieldCode, delimiter) => {
      if (!field) return null;
      let del = (delimiter) ? delimiter : ' ';
      let out;
      let subs = [];
      if (field.subfields) {
        field.subfields.forEach(s => {
          for (let code in s) {
            if (!subFieldCode || subFieldCode.match(code)) subs.push(s[code])
          }
        });
        out = subs.join(del);
      } else {
        out = field[0];
      }
      return out;
    }

    const writeJsonl = (path, data) => {
      let jsonStr = JSON.stringify(data) + '\n';
      fs.writeFileSync(path, jsonStr, { flag: 'a' });
    }

    const logger = new console.Console(fs.createWriteStream(files.log));

    const fileStream = fs.createReadStream(inFile);

    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });

    let c = 0;
    let openCount = 0;
    let closedCount = 0;
    let fail = 0;
    let lnum = 0;
    for await (const line of rl) {
      lnum++;
      try {
        let marc = JSON.parse(line);
        let fields = parseMarc(marc);
        let titleField = fields['245'][0];
        let title = fieldToString(titleField, 'abnp') || 'Untitled';
        
        title = title.replace(/[/ ]*$/, '');
        let pof = fields['960'][0];
        if (pof) {
          let spo = parseField(pof);
          if (!spo.z) throw(`WARN No order number found in record!`);
          let poNum = spo.z[0].replace(/^..(.+)./, '$1');
          let poId = uuid(poNum, ns); 
          
          let orderDate = spo.q[0] || '';
          orderDate = orderDate.replace(/(\d\d)-(\d\d)-(\d\d)/, '20$3-$1-$2');

          

          let vcode = (spo.v) ? spo.v[0].trim() : '';
          let orgId = refData.organizations[vcode] || 'ERR';
          if (orgId === 'ERR') throw (`WARN Organization not found for "${vcode}"`);
          let statCode = spo.m[0];
          let status = {
            wrk: 'Open'
          };
          if (statCode === 'o') {
            status.pay = 'Awaiting Payment';
          } else if (statCode === 'z') {
            status.pay = 'Cancelled',
            status.wrk = 'Closed'
          } else if (statCode === 'a') {
            status.pay = 'Fully Paid',
            status.wrk = 'Closed'
          } else if (statCode === 'q') {
            status.pay = 'Partially Paid'
          } else if (statCode === 'f') {
            status.pay = 'Ongoing'
          } else {
            status.wrk = 'Pending',
            status.pay = 'Pending'
          }

          if (orderDate < `${fy}-07` && status.wrk === 'Closed') {
            throw(`WARN Order date ${orderDate} is less than ${fy}-07 and status is ${status.wrk}`);
          }

          /*
          if (wfs && wfs !== status.wrk) {
            throw(`WARN Workflow status ${status.wrk} does not equal ${wfs}`);
          }
          */

          let co = {
            id: poId,
            poNumber: poNum,
            vendor: orgId,
            dateOrdered: orderDate,
            workflowStatus: status.wrk,
            notes: []
          };
          let oType = spo.i[0];
          co.orderType = (oType.match(/[os]/)) ? 'Ongoing' : 'One-Time';
          if (co.orderType === 'Ongoing') {
            co.ongoing = {};
          }
          let noteField = fields['961'] || [];
          let ogNotes = [];
          let requester = '';
          let selector = '';
          let rush = false;
          noteField.forEach(n => {
            let ns = parseField(n);
            if (ns.c) {
              ns.c.forEach(t => {
                co.notes.push(t);
              });
            }
            if (ns.d) {
              ns.d.forEach(t => {
                if (t.match(/\brush\b/i)) rush = true;
                co.notes.push(t);
              });
            }
            if (ns.c) {
              ns.c.forEach(t => {
                ogNotes.push(t);
              });
            }
            if (ns.k) {
              requester = ns.k[0]
            }
            if (ns.f) {
              selector = ns.f[0]
            }
          });
          if (co.ongoing) {
            if (ogNotes.length > 0) {
              co.ongoing.notes = ogNotes.join(' ; ');
            }
            if (oType === 's') {
              co.ongoing.isSubscription = true;  
              co.ongoing.renewalDate = orderDate;
              co.ongoing.interval = 365;
            } else {
              co.ongoing.isSubscription = false;
            }
          }
          let addType = (spo.k) ? spo.k[0] : '';
          addType = addType.trim();
          if (addType) co.shipTo = addresses[addType] || '';
          
          // PO lines start here

          let lineNum = poNum + '-1';
          let lineId = uuid(lineNum, ns);
          let pol = {
            id: lineId,
            purchaseOrderId: poId,
            paymentStatus: status.pay,
            poLineNumber: poNum + '-1',
            contributors: [],
            rush: rush
          };

          if (fields['100']) {
            let au = fieldToString(fields['100'][0]);
            let contrib = {
              contributor: au,
              contributorNameTypeId: '2b94c631-fca9-4892-a730-03ee529ffe2a' // personal name
            };
            pol.contributors.push(contrib);
          }
          if (fields['110']) {
            let au = fieldToString(fields['110'][0]);
            let contrib = {
              contributor: au,
              contributorNameTypeId: '2e48e713-17f3-4c13-a9f8-23845bb210aa' // corporate author
            };
            pol.contributors.push(contrib);
          }
          if (fields['250']) {
            pol.edition = fieldToString(fields['250'][0]);
          }
          if (fields['260']) {
            pol.publisher = fieldToString(fields['260'][0], 'b');
            pol.publicationDate = fieldToString(fields['260'][0], 'c');
          } else if (fields['264']) {
            pol.publisher = fieldToString(fields['264'][0], 'b');
            pol.publicationDate = fieldToString(fields['264'][0], 'c');
          }
          pol.source = 'User';
          let am = spo.a[0];
          pol.acquisitionMethod = methodMap[am] || 'Purchase';
          pol.titleOrPackage = title;
          let price = spo.s[0];
          if (!price) throw(`WARN price not found in source record!`)
          price = price.replace(/[$,]/g, '');
          price = parseFloat(price);
          pol.cost = {
            discount: 0,
            discountType: 'percentage',
            currency: 'USD',
          };

          if (requester) pol.requester = requester;
          if (selector) pol.selector = selector;

          let quant = parseInt(spo.o[0], 10);
          if (spo.g[0] === 'e') {
            pol.orderFormat = 'Electronic Resource';
            pol.cost.listUnitPriceElectronic = price;
            pol.cost.quantityElectronic = quant;
            pol.eresource = {
              createInventory: 'None'
            }
          } else {
            pol.orderFormat = 'Physical Resource';
            pol.cost.listUnitPrice = price;
            pol.cost.quantityPhysical = quant;
            pol.physical = {
              createInventory: 'None'
            };
          }
          pol.cost.poLineEstimatedPrice = price * quant;

          let fundCode = spo.u[0];
          if (orderDate < curFyStart) fundCode += '-p';
          let fundId = refData.funds[fundCode];
          if (!fundId) throw(`WARN Can't find fundId for "${fundCode}"`);
          let fundDist = {
            fundId: fundId,
            distributionType: 'percentage',
            value: 100
          };
          pol.fundDistribution = [ fundDist ];

          let trans = {
            id: uuid(lineId, ns),
            amount: price * quant,
            currency: 'USD',
            fiscalYearId: refData.fiscalYears.FY2021,
            source: 'PoLine',
            transactionType: 'Encumbrance',
            fromFundId: fundId
          };
          let enc = {
            initialAmountEncumbered: price * quant,
            status: 'Unreleased',
            orderType: co.orderType,
            subscription: false,
            reEncumber: false,
            sourcePurchaseOrderId: poId,
            sourcePoLineId: lineId
          }
          if (co.ongoing) { 
            enc.subscription = co.ongoing.isSubscription;
            co.reEncumber = true;
          }
          if (enc.status === 'Fully Paid') {
            enc.status = 'Released';
            trans.transactionType = 'Payment';
          }
          trans.encumbrance = enc;

          let locCode = spo.t[0];
          let locId = refData.locations[locCode];
          if (!locId) throw(`WARN Can't find locactionId for "${locCode}"`);
          let locations = {
            locationId: locId
          };
          if (pol.cost.quantityElectronic) {
            locations.quantityElectronic = quant;
          } else {
            locations.quantityPhysical = quant;
          }
          pol.locations = [ locations ];

          let localField = fields['907'][0];
          let bibNum = fieldToString(localField, 'a');
          if (bibNum) {
            bibNum = bibNum.replace(/^.(.+)./, '$1');
            pol.instanceId = bibMap[bibNum];
          }

          let rdate = spo.r[0];
          if (rdate.match(/\d\d/)) {
            rdate = rdate.replace(/(..)-(..)-(..)/, '20$3-$1-$2');
            pol.receiptDate = rdate;
            pol.receiptStatus = 'Fully Received';
          }

          let summary = {
            id: poId,
            numTransactions: 1
          }

          if (co.workflowStatus !== 'Closed') {
            co.compositePoLines = [ pol ];
            writeJsonl(files.co, co);
            openCount++;
          } else {
            writeJsonl(files.po, co);
            writeJsonl(files.pol, pol);
            if (pol.paymentStatus !== 'Cancelled') {
              writeJsonl(files.trans, trans);
              writeJsonl(files.summ, summary);
            }
            closedCount++;
          }
          c++;
        }
       
      } catch (e) {
        let msg = `[${lnum}] ${e}`;
        console.log(msg);
        logger.log(msg);
        fail++;
      }
    }
    let end = new Date().valueOf();
    let tt = (end - start) / 1000;
    console.log('Open orders created', openCount);
    console.log('Closed orders created', closedCount);
    console.log('Failures', fail);
    console.log('Time (secs)', tt);
  } catch (e) {
    console.error(e);
  }
})();