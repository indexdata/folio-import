const fs = require('fs');
const uuid = require('uuid/v5');

const ns = 'e35dff4e-9035-4d6a-b621-3d42578f81c7';
const inFiles = {
  po: 'po.json',
  vendors: 'hz-vendors.json'
};
let files = {
  po: 'purchase-orders.jsonl',
  lines: 'po-lines.jsonl'
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

    let orgMap = {}
    for (let k in hz.vendors) {
      let h = hz.vendors[k].hz;
      let i = hz.vendors[k].id;
      if (h) orgMap[h] = i;
    }

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
      po: 0
    };

    // create po
    
    hz.po.forEach(p => {
      let obj = {};
      let idStr = p['po#'].toString();
      obj.id = uuid(idStr, ns);
      obj.poNumber = p.po_number;
      obj.orderType = 'One-Time';
      obj.approved = true;
      obj.approvedById = 'ecab315b-a6d1-3ef5-9af7-922ba4ec4088';
      obj.approvalDate = new Date(p.last_update_date).toISOString();
      obj.vendor = orgMap[p['vendor#']]; 
      obj.notes = [];
      if (p.descr) obj.notes.push(p.descr);
      if (p.vendor_note) obj.notes.push('Vendor note: ' + p.vendor_note);
      obj.dateOrdered = new Date(p.creation_date).toISOString();
      obj.billTo = billToId;
      obj.shipTo = shipToId;
      writeObj(files.po, obj);
      ttl.po++;
    });

    console.log('-----------------------------');
    for (k in ttl) {
      console.log(`${k}:`, ttl[k]);
    }
  
  } catch (e) {
    console.log(e);
  }
})();