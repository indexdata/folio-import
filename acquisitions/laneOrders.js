const fs = require('fs');
const uuid = require('uuid/v5');
const path = require('path');
const parse = require('csv-parse/lib/sync');

const ns = '79d090dc-e59f-4cef-bd0c-4a3038603fb3';

let refDir = process.argv[2];
const inFile = process.argv[3];
let fy = parseInt(process.argv[4], 10) || 2021;
let fyMax = fy + 1;

const refFiles = {
  organizations: 'organizations.json',
  configs: 'addresses.json',
  acquisitionsUnits: 'units.json',
  // funds: 'funds.json',
  // locations: 'locations.json'
};

addNotes = {
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

const addMap = {
  'Lane: Acquisitions': 'LANE_LIBRARY_ACQUISITIONS'
};

(async () => {
  try {
    let start = new Date().valueOf();
    if (!inFile) throw('Usage: node laneOrders.js <acq_ref_dir> <csv_file> [ <fiscal year> ]');
    if (!fs.existsSync(inFile)) throw new Error(`Can't find ${inFile}!`);
    refDir = refDir.replace(/\/$/, '');
    
    const dir = path.dirname(inFile);
    const fn = path.basename(inFile, '.csv');
    const outFile = `${dir}/folio-${fn}-${fy}.jsonl`;
    if (fs.existsSync(outFile)) fs.unlinkSync(outFile);

    const refData = {};
    for (let prop in refFiles) {
      console.log(`Mapping ${prop}...`);
      refData[prop] = {};
      let path = `${refDir}/${refFiles[prop]}`;
      let obj = require(path);
      obj[prop].forEach(p => {
        let code = p.code || p.name;
        refData[prop][code] = p.id
      })
    }
    // console.log(refData);

    let csv = fs.readFileSync(inFile, 'utf8');
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
        let orderType = (v.PO_TYPE_DESC === 'Continuation') ? 'Ongoing' : 'One-Time';
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
        for (let k in addNotes) {
          if (v[k]) {
            let text = v[k];
            let pre = addNotes[k];
            let note = `${pre}: ${text}`;
            co.notes.push(note);
          }
        }
        if (notes) {
          let nts = notes.split(/\n/);
          nts.forEach(n => {
            n = n.trim();
            if (n) co.notes.push(n);
          });
        }
        co.orderType = orderType;
        co.reEncumber = (orderType === 'Ongoing') ? true : false;
        if (orderType === 'Ongoing') {
          co.ongoing = {
            isSubscription: 'true'
          }
        }
        co.vendor = vendorId || vendorCode;
        co.workflowStatus = wfStatus;
        co.acqUnitIds = [ unit ];

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