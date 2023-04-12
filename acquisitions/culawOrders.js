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
let instFile = process.argv[3];
const inFile = process.argv[4];
const debug = process.env.DEBUG;

const refFiles = {
  organizations: 'organizations.json',
  funds: 'funds.json',
  entries: 'fund-codes.json',
  locations: 'locations.json',
  acquisitionMethods: 'acquisition-methods.json',
  mtypes: 'material-types.json'
};

const formMap = {
  m: "book",
  s: "serial",
  l: "serial",
  v: "video recording",
  c: "web"
};

const payMap = {
  a: 'Fully paid',
  d: 'Fully paid',
  z: 'Cancelled',
  o: 'Pending',
  f: 'Ongoing'
};

(async () => {
  let startTime = new Date().valueOf();
  try {
    if (!inFile) throw('Usage: node culawOrders.js <acq_ref_dir> <instances_jsonl_file> <orders_text_file>');
    if (!fs.existsSync(inFile)) throw new Error(`Can't find ${inFile}!`);
    refDir = refDir.replace(/\/$/, '');
    let locMapFile = `${refDir}/locations.tsv`;
    if (!fs.existsSync(locMapFile)) throw new Error(`Can't open location map file at ${locMapFile}`);

    const dir = path.dirname(inFile);
    const fn = path.basename(inFile, '.txt');
    const outFile = `${dir}/folio-${fn}.jsonl`;
    if (fs.existsSync(outFile)) fs.unlinkSync(outFile);

    const tagFile = `${dir}/folio-tags.jsonl`;
    if (fs.existsSync(tagFile)) fs.unlinkSync(tagFile);
    
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

    // map instances

    const instfileStream = fs.createReadStream(instFile);

    const irl = readline.createInterface({
      input: instfileStream,
      crlfDelay: Infinity
    });

    console.log('Reading instance file...');
    const instMap = {};
    let ic = 0;
    for await (let line of irl) {
      ic++;
      let inst = JSON.parse(line);
      instMap[inst.hrid] = inst;
      if (ic%10000 === 0) {
        console.log('Instances read:', ic);
      }
    }
    console.log('Total instances read:', ic);

    const writeTo = (fileName, data) => {
      let outStr = JSON.stringify(data) + '\n';
      fs.writeFileSync(fileName, outStr, { flag: 'a' });
    }

    const dateParse = (dateStr) => {
      let out = dateStr.replace(/(..-..)-(....)/, '$2-$1');
      out = out.replace(/^(..-..)-(..)/, '19$2-$1');
      return out;
    }

    // make tags
    const tagMap = { k: 'Vital Law', w: 'LMA', l: 'MAP', '-' : 'LMA' };
    for (let k in tagMap) {
      let tob = {
        label: tagMap[k],
        description: tagMap[k],
        id: uuid(tagMap[k] + tagMap, ns)
      }
      writeTo(tagFile, tob);
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

    const fundId = refData.funds['Law'];
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
        let cols = line.split(/"\+?"/);
        let so = {};
        if (lnum === 1) {
          head = cols;
        } else {
          head.forEach((h, i) => {
            so[h] = cols[i];
          });

          let poNum = (so['RECORD #(ORDER)']) ? 'l' + so['RECORD #(ORDER)'] : '';
          let poId = uuid(poNum, ns);
          let vend = so.VENDOR.replace(/^l([^-])/, 'l-$1');
          vend = vend.trim();
          let orgId = refData.organizations[vend];
          if (!orgId) throw (`WARN No organizationId found for ${vend}`);
          let created = so.ODATE;
          if (created.match(/\d/)) {
            created = dateParse(created);
          } else {
            created = '2000-01-01';
          }
          let rdate = (so.RDATE.match(/\d/)) ? dateParse(so.RDATE) : '';
          let otype = so['ORD TYPE'];
          let ostat = so['STATUS'];
          let code2 = so['CODE2'];
          let priceStr = so['E PRICE'] || '0';
          priceStr = priceStr.replace(/^\$/, '');
          let price = parseFloat(priceStr);
          let form = so['FORM'];
          let formStr = formMap[form];
          let payStat = payMap[ostat] || 'Awaiting payment';
          let materialTypeId = refData.mtypes[formStr] || refData.mtypes.unspecified;
          if (!materialTypeId) throw(`WARN can't find materialTypeId for ${form} (${formStr})`);
          let copies = so['COPIES'];
          let quant = parseInt(copies, 10);
          let loc = so['LOC'].trim();
          let locId = refData.locations[loc];
          if (!locId) throw(`WARN can't find locationId for ${loc} (${poNum})`)
          let orderType = (otype === 's') ? 'Ongoing' : 'One-Time';
          let reEnc = (ostat === 'f') ? false : true;
          let wfStat = (ostat.match(/[of]/)) ? 'Open' : 'Closed';
          // wfStat = 'Pending';
          let co = {
            id: poId,
            poNumber: poNum,
            vendor: orgId,
            dateOrdered: created,
            compositePoLines: [],
            notes: [],
            acqUnitIds: [ unit ],
            orderType: orderType,
            reEncumber: reEnc,
            workflowStatus: wfStat
          }
          nfields.forEach(f => {
            if (so[f]) {
              let notes = so[f].split(/";"/);
              notes.forEach(n => {
                co.notes.push(n);
              });
            }
          });
          if (tagMap[code2]) {
            co.tags = { tagList: [ tagMap[code2] ] };
          }

          if (orderType === 'Ongoing') {
            co.ongoing = {
              interval: 365,
              isSubscription: true,
              manualRenewal: true
            };
          }
          
          // PO lines start here

          let bid = 'l' + so['RECORD #(BIBLIO)'];
          bid = bid.replace(/.$/, '');
          let amId = refData.acquisitionMethods['Purchase'];
          let inst = instMap[bid];
          let pol = {
            acquisitionMethod: amId,
            poLineNumber: poNum + '-1',
            source: 'User',
            checkinItems: false,
            purchaseOrderId: co.id,
            fundDistribution: [],
            locations: [],
            paymentStatus: payStat
          };
          pol.id = uuid(pol.poLineNumber, ns);
          if (orderType === 'Ongoing') {
            pol.checkinItems = true;
          }
          pol.orderFormat = (form === 'c') ? 'Electronic Resource' : 'Physical Resource';
          if (inst) {
            pol.instanceId = inst.id;
            pol.titleOrPackage = inst.title;
          } else {
            console.log(`WARN No instance found for ${bid}`);
          }
          pol.receiptStatus = (rdate) ? 'Fully Received' : 'Awaiting Receipt';
          if (rdate) pol.receiptDate = rdate;
          let locObj = {
            locationId: locId,
            quantity: quant
          };
          let cost = {
            currency: 'USD',
          };
          if (pol.orderFormat === 'Electronic Resource') {
            cost.listUnitPriceElectronic = price;
            cost.quantityElectronic = quant;
            locObj.quantityElectronic = quant;
            pol.eresource = {
              createInventory: 'None',
              materialType: materialTypeId 
            };
          } else {
            cost.listUnitPrice = price;
            cost.quantityPhysical = quant;
            locObj.quantityPhysical = quant;
            pol.physical = {
              createInventory: 'None',
              materialType: materialTypeId,
              volumes: []
            };
          }
          pol.cost = cost;
          pol.locations.push(locObj);

          let fd = {
            distributionType: 'percentage',
            value: 100,
            fundId: fundId,
            code: 'Law'
          }
          pol.fundDistribution.push(fd);

          co.compositePoLines.push(pol);

          // console.log(co);
          writeTo(outFile, co);
          c++;
        }
      } catch (e) {
        if (debug) {
          console.log(e);
        } else {
          console.log(`[${lnum}] ${e}`);
        }
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