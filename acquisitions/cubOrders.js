const fs = require('fs');
const readline = require('readline');
const uuid = require('uuid/v5');
const path = require('path');
const { STATUS_CODES } = require('http');

let startDate = '2022-07-01';
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
  locations: 'locations.json',
  acquisitionMethods: 'acquisition-methods.json',
  mtypes: 'material-types.json'
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

otherCodes = {
  "aaass": "aaas",
  "aiaas": "aiaa",
  "aiphs": "aip",
  "alas": "ala",
  "alexs": "alexa",
  "arls": "arl",
  "aspre": "ap",
  "assps": "assp",
  "astms": "astm",
  "bobkc": "bosto",
  "briln": "brill",
  "casas": "casal",
  "ciss": "umis",
  "harrs": "harra",
  "isis": "clari",
  "japas": "japan",
  "maruz": "maruj",
  "moods": "fiss",
  "oecds": "oecd",
  "orint": "corne",
  "priss": "prima",
  "sages": "conqs",
  "spcrs": "spcms",
  "spies": "spie",
  "ucp": "uchic",
  "ugss": "utgss",
  "uillp": "illpr",
  "uslcs": "loc",
  "visin": "sdvs",
};

(async () => {
  let startTime = new Date().valueOf();
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

    const polFile = `${dir}/folio-${fn}-pols.jsonl`;
    if (fs.existsSync(polFile)) fs.unlinkSync(polFile);

    const errFile = `${dir}/folio-${fn}-errs.jsonl`;
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
        code = code.trim();
        if (prop === 'entries') {
          let codeNum = `${p.codeNumber}`;
          codeNum = codeNum.padStart(5, '0');
          refData[prop][codeNum] = { id: refData.funds[code], code: code };
        } else {
          refData[prop][code] = p.id;
        }
      })
    }
    // console.log(refData.entries); return;

    const locMap = {};
    let locData = fs.readFileSync(locMapFile, { encoding: 'utf8' });
    locData.split(/\n/).forEach(line => {
      let [k, v] = line.split(/\t/);
      k = k.trim();
      v = (v) ? v.trim() : '';
      v = v.replace(/^.+\//, '');
      locMap[k] = refData.locations[v];
    });
    locMap['unmapped'] = refData.locations['UNMAPPED'];
    // console.log(locMap); return;

    const fileStream = fs.createReadStream(inFile);

    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });

    let c = 0;
    let lnum = 0;
    let fail = 0;
    let skipped = 0;
    for await (const line of rl) {
      lnum++;
      try {
        let so = JSON.parse(line);
        let ff = so.fixedFields;
        let created = (ff['13']) ? ff['13'].value : '1970-01-01';
        let oType = (ff['15']) ? ff['15'].value : '';
        let oNote = (ff['14']) ? ff['14'].value : '';
        let statCode = (ff['20']) ? ff['20'].value : '';
        let status = 'Closed';
        if (statCode === '1') {
          status = 'Pending'
        } else if (statCode === 'o' || statCode === 'f') { 
          status = 'Open'
        }
        let orderType = (statCode.match(/[fz]/) && oType.match(/[dnoqs]/)) ? 'Ongoing' : 'One-Time';
        if (status !== 'Closed') {
          let poNum = so.id.toString();
          let poId = uuid(poNum, ns);
          let vcode = ff['22'].value || '';
          vcode = vcode.trim();
          vcode = (otherCodes[vcode]) ? otherCodes[vcode] : vcode;
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
            compositePoLines: [],
            notes: [],
            acqUnitIds: [ unit ],
            reEncumber: false
          }
          let acqType = (ff['1']) ? ff['1'].value : '';
          let form = (ff['11']) ? ff['11'].value : '';
          let raction = (ff['16']) ? ff['16'].value : '';
          let rdate = (ff['17']) ? ff['17'].value : '';

          co.orderType = orderType;
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
            purchaseOrderId: poId,
            poLineNumber: poNum + '-1',
            source: 'User',
            checkinItems: false,
            locations: []
          };
          pol.id = uuid(pol.poLineNumber, ns);
          pol.rush = (raction.match(/[anrm]/)) ? true : false;
          if (rdate.match(/\d{4}-\d\d-\d\d/)) {
            pol.receiptStatus = 'Fully Received';
            pol.receiptDate = rdate;
          }
          pol.paymentStatus = (statCode.match(/^[az]$/)) ? 'Fully Paid' : 'Awaiting Payment';


          if (oType === 'a') {
            pol.acquisitionMethod = refData.acquisitionMethods['Approval Plan'];
          } else if (oType.match(/[ew]/)) {
            pol.acquisitionMethod = refData.acquisitionMethods['Demand Driven Acquisitions (DDA)'];
          } else if (acqType === 'd') {
            pol.acquisitionMethod = refData.acquisitionMethods['Depository'];
          } else if (acqType === 'e') {
            pol.acquisitionMethod = refData.acquisitionMethods['Exchange'];
          } else if (acqType === 'g') {
            pol.acquisitionMethod = refData.acquisitionMethods['Gift'];
          } else if (oType === '2') {
            pol.acquisitionMethod = refData.acquisitionMethods['Evidence Based Acquisitions (EBA)'];
          } else {
            pol.acquisitionMethod = refData.acquisitionMethods['Purchase'];
          }

          if (!pol.acquisitionMethod) {
            throw new Error(`No acquisitionMethod found for plNum`);
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
          price = price.replace(/(\d\d)\.0+/, '.$1');
          price = parseFloat(price);
          co.totalEstimatedPrice = price;


          let loc = {};
          pol.cost = {};
          pol.cost.currency = 'USD';
          if (format === 'Electronic Resource') {
            pol.cost.listUnitPriceElectronic = price;
            pol.cost.poLineEstimatedPrice = price;
            pol.cost.quantityElectronic = copies;
            loc.quantityElectronic = copies;
            let mtypeName = eFormMap[form] || otypeMap[oType];
            pol.eresource = {
              createInventory: 'None',
              materialType: refData.mtypes[mtypeName] || refData.mtypes.unspecified,
            }
            pol.eresource.userLimit = (oNote === 's') ? 1 : (oNote === 'm') ? 3 : '';
          } else {
            pol.cost.listUnitPrice = price;
            pol.cost.poLineEstimatedPrice = price;
            pol.cost.quantityPhysical = copies;
            loc.quantityPhysical = copies;
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
          pol.description = bibId;

          let fundNum = ff['12'].value || '';
          let fundId = (refData.entries[fundNum]) ? refData.entries[fundNum].id : '';
          let fundCode = (refData.entries[fundNum]) ? refData.entries[fundNum].code : '';
          if (fundId) {
            let fd = {
              fundId: fundId,
              distributionType: 'percentage',
              value: 100,
              code: fundCode,
            };
            pol.fundDistribution = [ fd ];
          }
          else {
            console.log(`WARN no fundId found for Sierra fund code ${fundNum}`);
          }

          if (form.match(/[s2lmn]/i)) {
            pol.checkinItems = true;
          }
          if (form === 'c' && oType === 'o') pol.checkinItems = true; 
          
          co.compositePoLines.push(pol);
          let coStr = JSON.stringify(co) + '\n';
          fs.writeFileSync(outFile, coStr, { flag: 'a' });

          let polStr = JSON.stringify(pol) + '\n';
          fs.writeFileSync(polFile, polStr, { flag: 'a' });
          c++;
        } else {
          let reason;
          if (status === 'Closed') {
            reason = `it has a status of ${status}`;
          } else {
            reason = `it was created before ${startDate} on ${created}`; 
          }
          console.log(`[${lnum}] INFO Skipping ${so.id} since ${reason}`);
          skipped++;
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
