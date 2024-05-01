const fs = require('fs');
const readline = require('readline');
const uuid = require('uuid/v5');
const path = require('path');

let startDate = '1980-01-01';
const ns = '72132a0f-e27c-4462-8b30-4f9dafe1f710';
const nullns = '00000000-0000-0000-0000-000000000000';
const ver = '1';

let refDir = process.argv[2];
let instMapFile = process.argv[3];
const inFile = process.argv[4];

const refFiles = {
  organizations: 'organizations.json',
  funds: 'funds.json',
  locations: 'locations.json',
  acquisitionMethods: 'acquisition-methods.json',
  acquisitionsUnits: 'units.json',
  mtypes: 'material-types.json',
  expenseClasses: 'expense-classes.json'
};

const mapFiles = {
  codes: 'fund-codes.tsv'
}

const idSkip = {
  'c858e4f2-2b6b-4385-842b-60732ee14abb': 1,
  '5d164f4b-0b15-4e42-ae75-cfcf85318ad9': 1,
  '7e591197-f335-4afb-bc6d-a6d76ca3bace': 1,
  '439bfbae-75bc-4f74-9fc7-b2a2d47ce3ef': 1,
  'fc4e3f2a-887a-46e5-8057-aeeb271a4e56': 1
}

const methodMap = {
  '-': 'Uncategorized',
  a: 'Approval Plan',
  b: 'Backfile',
  c: 'Continuation (Law)',
  f: 'Uncategorized',
  g: 'Item Gift (Law)',
  i: 'Item S.O. (Law)',
  m: 'Membership',
  o: 'Standing order',
  r: 'Replacement (Law)',
  s: 'Subscription',
  v: 'Services',
  w: 'Free With Sub (Law)'
};

const formatMap = {
  cre: 'Electronic Resource',
  stane: 'Electronic Resource',
  crp: 'Physical Resource',
  stanp: 'Physical Resource',
  ddav: 'Electronic Resource'
};

const exClassMap = {
  cre: 'Online',
  crp: 'Periodical',
  ddav: 'Video'
};

const formMap = {
  b: "book",
  f: "film reel",
  k: "map",
  j: "membership acq",
  g: "compact disk",
  i: "lp",
  l: "microfilm",
  m: "microfiche",
  n: "newspaper",
  o: "document",
  p: "photograph acq",
  s: "journal",
  u: "bibliographic utility acq",
  w: "dvd: prospector",
  3: "score",
};

const eFormMap = {
  r: "book",
  e: "journal",
  j: "membership acq",
  u: "bibliographic utility acq",
  x: "database acq",
  y: "eresource collection",
  '4': "streaming video acq"
};

const otypeMap = {
  r: "annual access fee",
  z: "open access article processing charge (apc)",
  x: "accounting acq"
};

(async () => {
  let startTime = new Date().valueOf();
  try {
    if (!inFile) throw('Usage: node scuOrders.js <acq_ref_dir> <instances_file_jsonl> <sierra_orders_file_jsonl>');
    if (!fs.existsSync(inFile)) throw new Error(`Can't find ${inFile}!`);
    refDir = refDir.replace(/\/$/, '');
    let locMapFile = `${refDir}/locations.tsv`;
    if (!fs.existsSync(locMapFile)) throw new Error(`Can't open location map file at ${locMapFile}`);

    const dir = path.dirname(inFile);
    const fn = path.basename(inFile, '.jsonl');

    const outFile = `${dir}/f${fn}-composite.jsonl`;
    if (fs.existsSync(outFile)) fs.unlinkSync(outFile);

    const poFile = `${dir}/f${fn}-orders.jsonl`;
    if (fs.existsSync(poFile)) fs.unlinkSync(poFile);

    const polFile = `${dir}/f${fn}-lines.jsonl`;
    if (fs.existsSync(polFile)) fs.unlinkSync(polFile);

    const errFile = `${dir}/f${fn}-errs.jsonl`;
    if (fs.existsSync(errFile)) fs.unlinkSync(errFile);

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
        if (prop === 'expenseClasses') {
          code = p.name;
        }
        code = code.trim();
        if (prop === 'entries') {
          let codeNum = `${p.extCode}`;
          codeNum = codeNum.padStart(5, '0');
          refData[prop][codeNum] = { id: refData.funds[code] || null, code: code };
        } else {
          refData[prop][code] = p.id;
        }
      })
    }
    // console.log(refData.expenseClasses); return;
    // fs.writeFileSync(`${dir}/fund-code-map.json`, JSON.stringify(refData.entries, null, 2));

    for (let k in methodMap) {
      methodMap[k] = refData.acquisitionMethods[methodMap[k]];
    }
    // console.log(methodMap); return;

    for (let k in exClassMap) {
      exClassMap[k] = refData.expenseClasses[exClassMap[k]];
    }
    // console.log(methodMap); return;

    const locMap = {};
    let locData = fs.readFileSync(locMapFile, { encoding: 'utf8' });
    locData.split(/\n/).forEach(line => {
      let cols = line.split(/\t/);
      let k = cols[0];
      let v = cols[2];
      k = k.trim();
      v = (v) ? v.trim() : '';
      locMap[k] = refData.locations[v];
    });
    // console.log(locMap); return;

    const fundMap = {};
    for (let k in mapFiles) {
      let fn = refDir + '/' + mapFiles[k];
      let mdata = fs.readFileSync(fn, { encoding: 'utf8' });
      mdata.split(/\n/).forEach(l => {
        let cols = l.split(/\t/);
        let p = cols[0] + ':' + cols[1];
        let v = (cols[3]) ? cols[3].trim() : '';
        let vid = refData.funds[v];
        if (vid) fundMap[p] = { code: v, id: vid };
      });
    }
    // console.log(fundMap); return;


    let fileStream = fs.createReadStream(instMapFile);

    let rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });

    const instMap = {};
    console.log('Reading instances (this could take awhile)...');
    let ic = 0;
    for await (const line of rl) {
      ic++;
      let j = JSON.parse(line);
      let k = j.hrid;
      let v = {
        id: j.id,
        t: j.title
      }
      if (j.publication && j.publication[0]) {
        v.p = j.publication[0].publisher;
        v.d = j.publication[0].dateOfPublication;
      }
      if (j.contributors) {
        v.c = [];
        j.contributors.forEach(c => {
          v.c.push({ n: c.name, t: c.contributorNameTypeId });
        });
      }
      if (j.identifiers) {
        v.i = [];
        j.identifiers.forEach(x => {
          if (!idSkip[x.identifierTypeId]) {
            v.i.push({ v: x.value, t: x.identifierTypeId });
          }
        });
      }
      instMap[k] = v;
      if (ic % 100000 === 0) console.log('Instance records read:', ic);
    }
    console.log('Total instance records read:', ic);
    // console.log(JSON.stringify(instMap, null, 2)); return;

    fileStream = fs.createReadStream(inFile);

    rl = readline.createInterface({
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
        let ff = so.fixedFields;
        let cf = so.chargedFunds;
        let fundUrl = (cf) ? cf[0].fund : '';
        let vfs = so.varFields || [];
        let vf = {};
        vfs.forEach(v => {
          let t = v.fieldTag;
          if (!vf[t]) vf[t] = [];
          vf[t].push(v.content);
        });
        
        let created = (ff['83']) ? ff['83'].value.substring(0, 10) : '';
        let oType = (ff['15']) ? ff['15'].value : '';
        let status = 'Pending';
        let orderType = 'Ongoing';
        let location = ff['2'].value || '';
        location = location.trim();
        let unitId;
        let lib;
        if (location.match(/^h/)) { 
          unitId = refData.acquisitionsUnits['Law Library']
          unitName = 'LL';
        } else { 
          unitId = refData.acquisitionsUnits['University Library'];
          lib = 'UL'
        }
        if (status !== 'Closed') {
          let poNum = so.id.toString();
          let poId = uuid(poNum, ns);
          let vcode = ff['22'].value || '';
          vcode = vcode.trim();
          let orgId = refData.organizations[vcode];
          if (!orgId) {
            fs.writeFileSync(errFile, line + '\n', { flag: 'a' });
            throw(`ERROR no organizationId found for "${vcode}" (${poNum})`);
          }
          let co = {
            id: poId,
            poNumber: poNum,
            vendor: orgId,
            dateOrdered: created,
            notes: [],
            acqUnitIds: [ unitId ],
            reEncumber: false,
            workflowStatus: status,
          }
          let acqType = (ff['1']) ? ff['1'].value : '';
          let form = (ff['11']) ? ff['11'].value : '';
          let raction = (ff['16']) ? ff['16'].value : '';
          let rdate = (ff['17']) ? ff['17'].value : '';

          co.orderType = orderType;
          co.ongoing = {};
          /*
          if (co.orderType === 'Ongoing') {
            co.ongoing = {
              interval: 365,
              isSubscription: false,
              renewalDate: co.dateOrdered
            };
          }
          */

          let catNotes = [];
          if (vf.n) {
            vf.n.forEach(n => {
              if (n.match(/^CAT:/)) {
                catNotes.push(n);
              } else {
                co.notes.push(n);
              }
            });
          }

          let coString = JSON.stringify(co) + '\n';
          fs.writeFileSync(poFile, coString, { flag: 'a' });

          // PO lines start here

          co.compositePoLines = [];

          let pol = {
            purchaseOrderId: poId,
            poLineNumber: poNum + '-1',
            source: 'MARC',
            checkinItems: false,
            locations: [],
            details: {}
          };
          pol.id = uuid(pol.poLineNumber, ns);

          pol.paymentStatus = 'Pending';
          pol.acquisitionMethod = methodMap[oType];
          if (!pol.acquisitionMethod) {
            throw new Error(`No acquisitionMethod found for "${oType}"`);
          }
          if (catNotes[0]) {
            pol.details.receivingNote = catNotes.join('; ');
          }

          let uparts = fundUrl.split(/\//).reverse();
          let fundNum = uparts[0];
          let sunit = uparts[1];
          let fkey = sunit + ':' + fundNum;
          let fundCode = '';
          let fundId = '';
          if (fundMap[fkey]) {
            fundCode = fundMap[fkey].code;
            fundId = fundMap[fkey].id;
          }
          let format;
          if (lib === 'UL') {
            format = formatMap[fundCode] || 'Other';
          } else {
            if (so.bibs && so.bibs[0] && so.bibs[0].materialType) {
              let code = so.bibs[0].materialType.code;
              if (code === 'a' || code === '1') {
                format = 'Physical Resource';
              } else if (code === 'n' ) {
                format = 'Electronic Resource';
              } else {
                format = 'Other';
              }
            }
          }
          // if (format === 'Other') console.log(`INFO no orderFormat found for fundCode "${fundCode}"`);

          /*
          if (form.match(/[erxy4]/)) {
            format = 'Electronic Resource';
          } else if (form.match(/[ajuz]/)) {
            format = 'Other';
          } else if (form === '2') {
            format = 'P/E Mix';
          } else {
            format = 'Physical Resource';
          }
          */

          pol.orderFormat = format;

          let copies = ff['5'].value;
          copies = parseInt(copies);
          let price = ff['10'].value;
          price = price.replace(/(\d\d)\.0+/, '.$1');
          price = parseFloat(price);
          co.totalEstimatedPrice = price;

          let loc = {};
          pol.cost = {};
          pol.cost.currency = 'USD';
          if (format === 'Electronic Resource') {
            pol.cost.listUnitPriceElectronic = 0;
            pol.cost.poLineEstimatedPrice = 0;
            pol.cost.quantityElectronic = 1;
            loc.quantityElectronic = 1;
            let mtypeName = eFormMap[form] || otypeMap[oType];
            pol.eresource = {
              createInventory: 'None',
              materialType: refData.mtypes[mtypeName] || refData.mtypes.unspecified,
            }
          } else {
            pol.cost.listUnitPrice = 0;
            pol.cost.poLineEstimatedPrice = 0;
            pol.cost.quantityPhysical = 1;
            loc.quantityPhysical = 1;
            let mtypeName = formMap[form] || otypeMap[oType];
            pol.physical = {
              createInventory: 'None',
              materialType: refData.mtypes[mtypeName] || refData.mtypes.unspecified
            };
          }

          loc.quantity = copies;
          loc.locationId = locMap[location] || locMap['unmapped'];
          if (!loc.locationId) throw(`ERROR no locationId found for "${location}"`)
          pol.locations.push(loc);

          let bibId = (so.bibs) ? so.bibs[0] : '';
          bibId = bibId.replace(/.+\//, '');
          console.log(bibId);
          bibId = 'b' + bibId;
          let inst = instMap[bibId];
          if (inst) {
            pol.instanceId = inst.id;
            pol.titleOrPackage = inst.t;
            if (inst.c) {
              pol.contributors = [];
              inst.c.forEach(c => {
                let au = {
                  contributor: c.n,
                  contributorNameTypeId: c.t
                }
                pol.contributors.push(au);
              });
            }
            if (inst.i) {
              pol.details.productIds = [];
              inst.i.forEach(x => {
                let o = {
                  productId: x.v,
                  productIdType: x.t
                };
                pol.details.productIds.push(o);
              });
            }
            if (inst.p) pol.publisher = inst.p;
            if (inst.d) pol.publicationDate = inst.d;
          } else if (so.bibs && so.bibs[0]) {
            pol.titleOrPackage = `[Unknown - ${bibId}]`;
            // pol.titleOrPackage = so.bibs[0].title
          }


          if (fundId) {
            let fd = {
              fundId: fundId,
              distributionType: 'percentage',
              value: 100,
              code: fundCode,
            };
            if (exClassMap[fundCode]) { fd.expenseClassId = exClassMap[fundCode] };
            pol.fundDistribution = [ fd ];
          }
          else {
            console.log(`WARN no fundId found for Sierra fund code ${fundNum} (${fundCode})`);
          }

          co.compositePoLines.push(pol);
          let coStr = JSON.stringify(co) + '\n';
          fs.writeFileSync(outFile, coStr, { flag: 'a' });

          let polStr = JSON.stringify(pol) + '\n';
          fs.writeFileSync(polFile, polStr, { flag: 'a' });
          c++;
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
  } catch (e) {
    console.log(e);
  }
})();
