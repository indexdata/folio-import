const fs = require('fs');
const uuid = require('uuid/v5');

const ns = 'e35dff4e-9035-4d6a-b621-3d42578f81c7';
const inFiles = {
  po: 'po.json',
  lines: 'po_line.json',
  vendors: 'hz-vendors.json',
  hzvend: 'vendor.json'
};
let files = {
  po: 'purchase-orders.jsonl',
  lines: 'po-lines.jsonl',
  orgs: 'orgs-not-found.jsonl'
};
const shipToId = 'd6900d6a-a7ce-469f-80da-bd599a16c137';
const billToId = 'd6900d6a-a7ce-469f-80da-bd599a16c137';


(async () => {
  try {
    let dir = process.argv[2];
    if (!dir) {
      throw 'Usage: node splPo.js <data_dir>';
    } else if (!fs.existsSync(dir)) {
      throw new Error('Can\'t find input directory');
    }

    dir = dir.replace(/\/$/, '');
    const hz = {};
    for (let f in inFiles) {
      let inFile = dir + '/' + inFiles[f];
      if (!fs.existsSync(inFile)) {
        throw new Error(`Can\'t find ${f} file at ${inFile}`);
      }
      console.log(`Loading Horizon ${f}...`);
      hz[f] = require(inFile);
    }

    newVendMap = {};
    hz.hzvend.forEach(v => {
      let vid = v['vendor#'];
      newVendMap[vid] = v;
    });

    linesMap = {};;
    hz.lines.forEach(l => {
      let poNum = l['po#'];
      if (!linesMap[poNum]) linesMap[poNum] = [];
      linesMap[poNum].push(l);
    });
    delete require.cache[hz.lines];

    /*
    for (let k in hz.vendors) {
      let h = hz.vendors[k].hz;
      let i = hz.vendors[k].id;
      if (h) orgMap[h] = i;
    }
    */

    for (let f in files) {
      let file = dir + '/' + files[f];
      if (fs.existsSync(file)) fs.unlinkSync(file);
      files[f] = file;
    }

    const writeObj = (fn, data) => {
      const jsonStr = JSON.stringify(data);
      fs.writeFileSync(fn, jsonStr + '\n', { flag: 'a' });
    }

    ttl = {
      po: 0,
      lines: 0,
      orgs: 0
    };

    // create po
    
    hz.po.forEach(p => {
      let obj = {};
      let poNum = p['po#'].toString();
      let idStr = poNum;
      poId = uuid(idStr, ns);
      obj.id = poId;
      obj.poNumber = p.po_number;
      obj.orderType = 'One-Time';
      obj.approved = true;
      obj.approvedById = 'ecab315b-a6d1-3ef5-9af7-922ba4ec4088';
      obj.approvalDate = new Date(p.last_update_date).toISOString();
      obj.reEncumber = true;
      obj.workflowStatus = 'Open'; 
      let venId = p['vendor#'];
      let orgId = hz.vendors[venId];
      if (orgId) {
        obj.vendor = hz.vendors[venId]; 
      } else {
        console.log('WARN Vendor not found in map:', venId);
        console.log('INFO Creating vendor object...');
        let ven = {};
        let newVen = newVendMap[venId];
        let vid = newVen['vendor#'];
        ven.id = uuid('v' + vid, ns);
        ven.name = newVen.name;
        ven.code = newVen.vendor;
        ven.status = 'Active';
        ven.isVendor = true;
        writeObj(files.orgs, ven)
        hz.vendors[venId] = ven.id;
        obj.vendor = ven.id;
        ttl.orgs++;
      }
      obj.notes = [];
      if (p.descr) obj.notes.push(p.descr);
      if (p.vendor_note) obj.notes.push('Vendor note: ' + p.vendor_note);
      obj.dateOrdered = new Date(p.creation_date).toISOString();
      obj.billTo = billToId;
      obj.shipTo = shipToId;
      writeObj(files.po, obj);
      ttl.po++;

      // make po_line;
      const test = {"27865":1, "27867":1, "27868":1, "27869":1, "27870":1, "27871":1, "27872":1, "27873":1, "27874":1, "27875":1};
      let lines = linesMap[poNum];
      if (lines && test[poNum]) {
        lines.forEach(l => {
          let lineNum = l.line.toString();
          let poLine = poNum + '-' + lineNum;
          let id = uuid(poLine, ns);
          lo = {
            id: id,
            poLineNumber: poLine,
            orderFormat: 'Physical Resource',
            source: "User",
            purchaseOrderId: poId,
            titleOrPackage: l.title,
            acquisitionMethod: 'Approval Plan',
            receiptStatus: 'Awaiting Receipt',
            paymentStatus: 'Pending'
          };
          let dis = (l.vendor_discount) ? l.vendor_discount * 100 : 0;
          costObj = {
            currency: 'USD',
            listUnitPrice: l.unit_price,
            discount: dis,
            discountType: 'percentage',
            quantityPhysical: 1
          }
          lo.cost = costObj;
          console.log(lo);
          writeObj(files.lines, lo);
          ttl.lines++;
        });
      } else {
        // console.log('WARN PO line not found:', poNum);
      }
    });

    console.log('-----------------------------');
    for (k in ttl) {
      console.log(`${k}:`, ttl[k]);
    }
  
  } catch (e) {
    console.log(e);
  }
})();