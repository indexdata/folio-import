const fs = require('fs');
const readline = require('readline');
const uuid = require('uuid/v5');
const path = require('path');

const ns = 'a839a191-e230-4c52-8e08-38e3bc5adfc0';

let refDir = process.argv[2];
const inFile = process.argv[3];
let fy = parseInt(process.argv[4], 10) || 2021;
let fyMax = fy + 1;

const refFiles = {
  organizations: 'organizations.json',
  funds: 'funds.json',
  locations: 'locations.json'
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
    if (!inFile) throw('Usage: node hcOrders.js <acq_ref_dir> <marc_jsonl_file> [ <fiscal year> ]');
    if (!fs.existsSync(inFile)) throw new Error(`Can't find ${inFile}!`);
    refDir = refDir.replace(/\/$/, '');
    
    const dir = path.dirname(inFile);
    const fn = path.basename(inFile, '.jsonl', '.json');
    const outFile = `${dir}/folio-${fn}-${fy}.jsonl`;
    if (fs.existsSync(outFile)) fs.unlinkSync(outFile);

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
    // console.log(refData);

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

    const fileStream = fs.createReadStream(inFile);

    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });

    let c = 0;
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
          if (orderDate < `${fy}-07` || orderDate > `${fyMax}-06`) {
            throw(`WARN ${orderDate} is not of this fiscal year.`);
          }

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

          let co = {
            id: poId,
            poNumber: poNum,
            vendor: orgId,
            dateOrdered: orderDate,
            workflowStatus: status.wrk,
            compositePoLines: [],
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

          let pol = {
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

          let fundCode = spo.u[0];
          let fundId = refData.funds[fundCode];
          if (!fundId) throw(`WARN Can't find fundId for "${fundCode}"`);
          let fundDist = {
            fundId: fundId,
            distributionType: 'percentage',
            value: 100
          };
          pol.fundDistribution = [ fundDist ];

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
          co.compositePoLines.push(pol);

          // console.log(JSON.stringify(co, null, 2));
          let coStr = JSON.stringify(co) + '\n';
          fs.writeFileSync(outFile, coStr, { flag: 'a' });
          c++;
        }
       
      } catch (e) {
        console.log(`[${lnum}] ${e}`);
        fail++;
      }
    }
    let end = new Date().valueOf();
    let tt = (end - start) / 1000;
    console.log('Orders created', c);
    console.log('Failures', fail);
    console.log('Time (secs)', tt);
  } catch (e) {
    console.log(e);
  }
})();