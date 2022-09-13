const fs = require('fs');
const uuid = require('uuid/v5');
const path = require('path');
const parse = require('csv-parse/lib/sync');
const readline = require('readline');

const ns = '79d090dc-e59f-4cef-bd0c-4a3038603fb3';
const nons = '00000000-0000-0000-0000-000000000000';
const version = '2';
const isil = 'CSt-L';

let refDir = process.argv[2];
const inFile = process.argv[3];
const linesFile = process.argv[4];
const instFile = process.argv[5];
let fy = parseInt(process.argv[4], 10) || 2021;
let fyMax = fy + 1;

const refFiles = {
  organizations: 'organizations.json',
  configs: 'addresses.json',
  acquisitionsUnits: 'units.json',
  acquisitionMethods: 'acquisition-methods.json',
  mtypes: 'material-types.json',
  funds: 'funds.json',
  locations: 'locations.json'
};

const addNotes = {
  PO_CREATE_DATE: 'PO_Create_Date in Voyager',
  CREATE_OPID: 'Creation Operator',
  CREATE_LOCATION_ID: 'Creation Location',
  PO_UPDATE_DATE: 'PO_Update_Date in Voyager',
  UPDATE_OPID: 'Update Operator',
  UPDATE_LOCATION_ID: 'Update Location',
  PO_STATUS_DATE: 'PO_Status_Date in Voyager',
  PO_STATUS_DESC: 'PO Status Description in Voyager',
  PRINT_NOTE: 'Instructions to Vendor from Voyager PO Notes'
};

const rstatusMap = {
  'Received Partial': 'Partially Received',
  'Received Complete': 'Fully Received',
  'Approved': 'Ongoing'
}

const addMap = {
  'Lane: Acquisitions': 'LANE_LIBRARY_ACQUISITIONS'
};

(async () => {
  try {
    let start = new Date().valueOf();
    if (!instFile) throw('Usage: node laneOrders.js <acq_ref_dir> <po_csv> <polines_csv> <instances_jsonl> [ <fiscal year> ]');
    if (!fs.existsSync(inFile)) throw new Error(`Can't find ${inFile}!`);
    refDir = refDir.replace(/\/$/, '');
    
    const dir = path.dirname(inFile);
    const fn = path.basename(inFile, '.csv');
    const outFile = `${dir}/composite-orders.jsonl`;
    if (fs.existsSync(outFile)) fs.unlinkSync(outFile);

    const refData = {};
    for (let prop in refFiles) {
      console.log(`Mapping ${prop}...`);
      refData[prop] = {};
      let path = `${refDir}/${refFiles[prop]}`;
      let obj = require(path);
      obj[prop].forEach(p => {
        let code = p.code || p.name || p.value;
        if (prop === 'locations') {
          code = code.replace(/^LANE-/, '');
        }
        refData[prop][code] = p.id;
      });
    }

    // gather po-lines
    let csv = fs.readFileSync(linesFile, 'utf8');
    let inRecs = parse(csv, {
      columns: true,
      skip_empty_lines: true
    });

    const poLines = {};
    inRecs.forEach(l => {
      let pon = l.PO_NUMBER;
      if (!poLines[pon]) poLines[pon] = [];
      poLines[pon].push(l);
    });
    // console.log(poLines); return;

    // gather instances
    console.log('Loading instances (this may take awhile)...')
    const fileStream = fs.createReadStream(instFile);
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });
    const insts = {};
    for await (const line of rl) {
      let rec = JSON.parse(line);
      let hrid = rec.hrid.replace(/^L/, '');
      insts[hrid] = {
        id: rec.id,
        title: rec.title,
        contributors: rec.contributors,
        publication: rec.publication,
        editions: rec.editions,
        identifiers: rec.identifiers
      }
    }
    // console.log(insts); return;

    // read orders file
    csv = fs.readFileSync(inFile, 'utf8');
    inRecs = parse(csv, {
      columns: true,
      skip_empty_lines: true
    });

    let c = 0;
    let fail = 0;
    let lnum = 0;
    let unit = refData.acquisitionsUnits.Lane;
    if (!unit) throw new Error(`Can't find acquisitions unit for Lane`);

    inRecs.forEach(v => {
      lnum++;
      try {
        let co = {};

        let poNumber = v.PO_NUMBER;
        let id = uuid(poNumber, ns);
        let approved = (v.PO_STATUS_DESC.match(/Complete|Approved|Received/)) ? true : false;
        let appDate = v.PO_APPROVE_DATE;
        appDate = appDate.replace(/ /, 'T');
        let billTo = addMap[v.BILL_LOCATION];
        let shipTo = addMap[v.SHIP_LOCATION];
        let notes = v.NOTE;
        let poType = v.PO_TYPE_DESC;
        let orderType = (poType === 'Continuation') ? 'Ongoing' : 'One-Time';
        let vendorCode = v.VENDOR_CODE;
        if (!vendorCode.match(/-LANE$/)) vendorCode += '-Lane';
        let vendorId = refData.organizations[vendorCode];
        if (!vendorId) throw(`WARN Vendor ID not found for "${vendorCode}"`);
        let wfStatus = (v.PO_STATUS_DESC === 'Pending') ? 'Pending' : 'Open';

        co.id = id;
        co.poNumber = poNumber;
        co.approved = approved;
        if (appDate) co.approvalDate = appDate;
        if (billTo) co.billTo = refData.configs[billTo];
        if (shipTo) co.shipTo = refData.configs[shipTo];
        co.notes = [];
        let anotes = [];
        if (notes) {
          let nts = notes.split(/\n/);
          nts.forEach(n => {
            n = n.trim();
            if (n) anotes.push(n);
          });
        }
        
        let combinedNotes = anotes.join('; ');
        if (combinedNotes) co.notes.push(combinedNotes);
        anotes = [];
        for (let k in addNotes) {
          if (v[k]) {
            let text = v[k];
            let pre = addNotes[k];
            let note = `${pre}: ${text}`;
            anotes.push(note);
          }
        }
        
        combinedNotes = anotes.join('; ');
        if (combinedNotes) co.notes.push(combinedNotes);
        co.orderType = orderType;
        co.reEncumber = (orderType === 'Ongoing') ? true : false;
        co.vendor = vendorId || vendorCode;
        co.workflowStatus = wfStatus;
        co.acqUnitIds = [ unit ];
        if (orderType === 'Ongoing') {
          co.ongoing = {
            isSubscription: false,
            // manualRenewal: true,
            // renewalDate: appDate
          };
        }

        if (poLines[poNumber]) {
          co.compositePoLines = [];
          poLines[poNumber].forEach(l => {
            let pol = {};
            let inst = insts[l.BIB_ID];
            pol.id = uuid(l.LINE_ITEM_ID + 'poline', ns);
            pol.purchaseOrderId = co.id;
            pol.poLineNumber = co.poNumber + '-' + l.LINE_ITEM_NUMBER;
            pol.source = 'User';
            let am = 'Purchase';
            let polType = l.LINE_ITEM_TYPE_DESC;
            if (poType === 'Approval' && polType === 'Single-part') {
              am = 'Demand Driven Acquisitions (DDA)';
            } else if (poType === 'Gift' && polType === 'Single-part') {
              am = 'Gift';
            } else if (poType === 'Continuation' && polType === 'Membership') {
              am = 'Membership';
            }
            pol.acquisitionMethod = refData.acquisitionMethods[am];
            if (l.NOTE) {
              let note = l.NOTE.replace(/\n\s*/g, ' -- ');
              pol.description = note;
            }
            
            if (inst) {
              pol.instanceId = inst.id;
              pol.titleOrPackage = inst.title;
              if (inst.editions && inst.editions[0]) pol.edition = inst.editions[0];
              if (inst.contributors && inst.contributors[0]) {
                pol.contributors = [];
                inst.contributors.forEach(c => {
                  pol.contributors.push({ contributor: c.name, contributorNameTypeId: c.contributorNameTypeId });
                })
              }
              if (inst.publication && inst.publication[0]) {
                pol.publisher = inst.publication[0].publisher;
                pol.publicationDate = inst.publication[0].dateOfPublication;
              }
              if (inst.identifiers && inst.identifiers[0]) {
                pol.details = { productIds: [] }
                inst.identifiers.forEach(i => {
                  if (i.identifierTypeId === '8261054f-be78-422d-bd51-4ed9f33c3422') {
                    i.value = i.value.replace(/^([0-9X]{10,13}).*/, '$1');
                  }
                  let pid = {
                    productIdType: i.identifierTypeId,
                    productId: i.value
                  }
                  pol.details.productIds.push(pid);
                });
              }
            }
            if (!pol.titleOrPackage) pol.titleOrPackage = 'Unknown'
            let price = parseInt(l.LINE_PRICE, 10);
            if (price > 0) price = price/100;
            let quant = parseInt(l.QUANTITY, 10);
            let oform = (pol.titleOrPackage.match(/\[digital\]/)) ? 'Electronic Resource' : 'Physical Resource'
            pol.orderFormat = oform;
            pol.cost = {
              currency: 'USD',
            };
            if (oform === 'Physical Resource') {
              pol.cost.listUnitPrice = price;
              pol.cost.quantityPhysical = quant;
              pol.physical = {
                createInventory: 'None',
                materialType: refData.mtypes['unspecified'],
                volumes: []
              };
            } else if (oform === 'Electronic Resource') {
              pol.cost.listUnitPriceElectronic = price;
              pol.cost.quantityElectronic = quant;
              pol.eresource = {
                createInventory: 'None',
              };
            }
            let fundCode = l.USE_FUND || '';
            fundCode = fundCode.replace(/-.+/, '');
            fundCode += '-Lane';
            let fundId = refData.funds[fundCode] || '';
            pol.fundDistribution = [];
            if (fundId) {
              fdist = {};
              fdist.fundId = fundId;
              fdist.distributionType = 'percentage';
              fdist.value = 100;
              pol.fundDistribution.push(fdist);
            }
            let loc = l.LOCATION_CODE;
            let locId = refData.locations[loc] || '';
            if (locId) {
              let lobj = {
                locationId: locId,
                quantity: quant
              }
              /*
              if (l.MFHD_ID) {
                let hid = uuid('LH' + l.MFHD_ID + isil + version, nons);
                lobj.holdingId = hid;
              }
              */
              if (oform === 'Electronic Resource') {
                lobj.quantityElectronic = quant;
              } else {
                lobj.quantityPhysical = quant;
              }
              pol.locations = [ lobj ];
              pol.receiptStatus = rstatusMap[l.LINE_ITEM_STATUS] || 'Awaiting Receipt';
            }
            co.compositePoLines.push(pol);
          });
          
        }
        

        // console.log(JSON.stringify(co, null, 2));
        let coStr = JSON.stringify(co) + '\n';
        fs.writeFileSync(outFile, coStr, { flag: 'a' });
        c++;
      } catch (e) {
        console.log(`[${lnum}] ${e}`);
        fail++;
      }
    });
    let end = new Date().valueOf();
    let tt = (end - start) / 1000;
    console.log('Orders created', c);
    console.log('Failures', fail);
    console.log('Time (secs)', tt);
  } catch (e) {
    console.error(e);
  }
})();