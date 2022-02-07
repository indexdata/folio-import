const { split } = require('event-stream');
const fs = require('fs');
const uuid = require('uuid/v5');
const { markAsUntransferable } = require('worker_threads');

const ns = 'e35dff4e-9035-4d6a-b621-3d42578f81c7';
const inFiles = {
  po: 'po.json',
  lines: 'po_line.json',
  vendors: 'hz-vendors.json',
  hzvend: 'vendor.json',
  instmap: 'instances-map.json',
  lineitems: 'po_line_item.json',
  budget: 'po_line_item_budget.json',
  loc: 'locations.json',
  funds: 'finance-storage__funds.json'
};
if (process.env.TESTPO) inFiles.po = 'testpo.json';
let files = {
  comp: 'composite-orders.jsonl',
  po: 'purchase-orders.jsonl',
  lines: 'po-lines.jsonl',
  orgs: 'orgs-not-found.jsonl',
  piecesmap: 'piecesMap.jsonl',
  notes: 'notes.jsonl'
};
const shipToId = 'd6900d6a-a7ce-469f-80da-bd599a16c137';
const billToId = 'd6900d6a-a7ce-469f-80da-bd599a16c137';
const mtype = '71fbd940-1027-40a6-8a48-49b44d795e46';

const isbnCheck = (isbn) => {
  isbn = isbn.replace(/-/g, '');
  let digits = isbn.split('');
  let len = digits.length;
  let checkDigit = digits.pop();
  checkDigit = checkDigit.replace(/[Xx]/, '10');
  let sums = 0;
  let dcount = 0;
  let multiplier = 0;
  let ten = 10;
  let check;
  digits.forEach(d => {
    dcount++;
    n = parseInt(d, 10);
    if (len === 13) {
      if (dcount % 2 === 0) {
        multiplier = 3;
      } else {
        multiplier = 1;
      }
      let prod = n * multiplier;
      sums += prod;
    } else {
      sums += ten * n;
      ten--;
    }
  });
  if (len === 13) {
    let rem = sums % 10;
    check = 10 - rem;
    if (rem === 0) check = 0;
  } else {
    let rem = sums % 11;
    check = 11 - rem;
  }
  if (check === parseInt(checkDigit, 10)) {
    return true;
  } else {
    return false;
  }
}

const makeNote = (content, poLineId, type) => {
  const note = {};
  note.id = uuid(poLineId + type, ns);
  note.content = `<div>${content}</div>`;
  note.domain = 'orders';
  note.links = [{ type: 'poLine', id: poLineId }];
  note.title = type;
  note.typeId = '66c718fa-d999-4cf8-9256-396fac481b6e';
  return note;
};

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

    const newVendMap = {};
    hz.hzvend.forEach(v => {
      let vid = v['vendor#'];
      newVendMap[vid] = v;
    });

    const linesMap = {};
    hz.lines.forEach(l => {
      let poNum = l['po#'];
      if (!linesMap[poNum]) linesMap[poNum] = [];
      linesMap[poNum].push(l);
    });
    delete require.cache[hz.lines];

    lineItems = {};
    hz.lineitems.forEach(i => {
      let po = i['po#'];
      let key = po + '-' + i.line;
      if (!lineItems[key]) lineItems[key] = [];
      lineItems[key].push(i);
    });
    delete require.cache[hz.lineItems];

    const budMap = {};
    hz.budget.forEach(b => {
      let lineNum = `${b['po#']}-${b.line}`;
      if (!budMap[lineNum]) {
        let yr = b.budget.replace(/^.+?\.(.+)/, '$1');
        if (yr < '2007') yr = '2007';
        let code = b.budget.replace(/^(.+?)\..*/, '$1');
        if (yr !== '2022') {
          code = 'm' + yr;
        }
        budMap[lineNum] = code;
      }
    });
    delete require.cache[hz.budget];

    const locMap = {};
    hz.loc.locations.forEach(l => {
      locMap[l.code] = l.id;
    });

    const fundMap = {};
    const fundIn = fs.readFileSync(dir + '/fundmap.tsv', { encoding: 'utf8' });
    fundIn.split(/\n/).forEach(l => {
      l = l.trim();
      let col = l.split(/\t/);
      if (col[0]) fundMap[col[0]] = col[1];
    });

    const folioFunds = {};
    hz.funds.funds.forEach(f => {
      folioFunds[f.code] = f.id;
    });

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
      orgs: 0,
      notes: 0
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
      ttl.po++;

      // make po_line;
      let lines = linesMap[poNum];
      obj.compositePoLines = [];
      if (lines) {
        lines.forEach(l => {
          let lineNum = l.line.toString();
          let poLine = poNum + '-' + lineNum;
          let id = uuid(poLine, ns);
          let lo = {
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
          let bid = l['bib#'];
          if (bid && hz.instmap[bid]) { lo.instanceId = hz.instmap[bid] }
          if (l.edition) { lo.edition = l.edition }
          if (l.author) {
            let cobj = {
              contributor: l.author,
              contributorNameTypeId: '2b94c631-fca9-4892-a730-03ee529ffe2a'
            }
            lo.contributors = [ cobj ];
          }
          if (l.publisher) { lo.publisher = l.publisher }
          if (l.isbn || l.issn || l.workslip_note) {
            let dobj = { productIds: [] };
            if (l.isbn && l.isbn.match(/^[0-9xX]{10,13}.*/)) {
              let bn = l.isbn.replace(/^([0-9xX]+).*/, '$1');
              if (isbnCheck(bn)) {
                let isbnObj = {
                  productId: bn,
                  productIdType: '8261054f-be78-422d-bd51-4ed9f33c3422'
                }
                dobj.productIds.push(isbnObj);
              }
            }
            if (l.issn && l.issn.match(/^[0-9]{4}-[0-9X]/)) {
              let sn = l.issn.replace(/^([0-9Xx-]{9}).*/, '$1');
              let issnObj = {
                productId: sn,
                productIdType: '913300b2-03ed-469a-8179-c1092c991227'
              }
              dobj.productIds.push(issnObj);
            }
            if (l.workslip_note && l.workslip_note.match(/\S/)) {
              dobj.receivingNote = l.workslip_note;
            }
            lo.details = dobj;
          }
          let dis = (l.vendor_discount) ? l.vendor_discount * 100 : 0;

          lo.locations = [];
          let physicalCount = 0;
          let lcount = {};
          let paid = false;
          if (lineItems[poLine]) {
            lineItems[poLine].forEach(li => {
              if (!li.receive_date) paid = true;
              if (1) {
                let loc = locMap[li.location];
                if (!lcount[loc]) lcount[loc] = 0;
                lcount[loc]++;
                physicalCount++;
                let piecesMap = {};
                piecesMap[li['item#']] = { poLineId: id, titleId: lo.instanceId, locationId: loc };
                writeObj(files.piecesmap, piecesMap);
              }
            });
            for (let li in lcount) {
              locObj = {
                locationId: li,
                quantity: lcount[li],
                quantityPhysical: lcount[li]
              };
              lo.locations.push(locObj);
            }
          }
          costObj = {
            currency: 'USD',
            listUnitPrice: l.unit_price || 0,
            discount: dis,
            discountType: 'percentage',
            quantityPhysical: physicalCount
          };
          phyObj = {
            materialType: mtype,
            createInventory: 'None',
            volumes: []
          };
          let fundCode = budMap[poLine] || '';
          let folioFundCode = fundMap[fundCode] || '';
          distObj = {
            code: folioFundCode,
            fundId: folioFunds[folioFundCode],
            distributionType: 'percentage',
            value: 100
          };
          lo.cost = costObj;
          lo.physical = phyObj;
          if (distObj.fundId) lo.fundDistribution = [ distObj ];
          if (paid) {
            lo.paymentStatus = 'Fully Paid';
            lo.receiptStatus = 'Fully Received';
          }
          if (l.internal_note) {
            let note = makeNote(l.internal_note, id, 'Internal note');
            writeObj(files.notes, note);
            ttl.notes++;
          }
          if (l.order_note) {
            let note = makeNote(l.order_note, id, 'Order note');
            writeObj(files.notes, note);
            ttl.notes++;
          }
          obj.compositePoLines.push(lo);
          ttl.lines++;
        });
      } 
      writeObj(files.comp, obj);
    });

    console.log('-----------------------------');
    for (k in ttl) {
      console.log(`${k}:`, ttl[k]);
    }
  
  } catch (e) {
    console.log(e);
  }
})();