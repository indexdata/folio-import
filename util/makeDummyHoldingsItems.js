const uuid = require('uuid/v5');
const fs = require('fs');
const instFile = process.argv[2];

if (!instFile) throw new Error('Usage: makeDummyHoldingsItems.js <instances.json file>');

const inst = require(instFile);

const ns = '00000000-0000-0000-0000-000000000000';
const path = instFile.replace(/(.+)\..+/, '$1');

locs = {
  main: 'fcd64ce1-6995-48f0-840e-89ffa2288371',
  annex: '53cf956f-c1df-410b-8bea-27f712cca7c0',
  cd: '758258bc-ecc1-41b8-abca-f7b610822ffd'
};

const meta = {
  createdDate: '2020-02-05T00:00:00Z',
  updatedDate: '2020-02-05T00:00:00Z'
}

const holdings = { holdingsRecords: [] };
const items = { items: [] };
let c = 0
inst.instances.forEach(i => {
  c++;
  let holding = {};
  holding.id = uuid(i.id, ns);
  holding.instanceId = i.id;
  holding.hrid = `H${i.hrid}`;
  if (i.modeOfIssuanceId === '612bbd3d-c16b-4bfb-8517-2afafc60204a') {
    holding.permanentLocationId = locs.annex;
  } else {
    holding.permanentLocationId = locs.main;
  }

  let ti = i.title.substring(0, 3);
  let num = c%1000;
  let cn = num.toString().padStart(3, '0') + ` ${ti}`;
  let ct = '6caca63e-5651-4db6-9247-3205156e9699';
  if (i.classifications[0]) {
    cn = i.classifications[0].classificationNumber;
    // ct = i.classifications[0].classificationTypeId;
  } 
  holding.callNumber = cn;
  holding.callNumberTypeId = ct;
  holding.metadata = meta;

  holdings.holdingsRecords.push(holding);

  let item = {} 
  item.id = uuid(i.id + 'item', ns);
  item.holdingsRecordId = holding.id; 
  let bnum = c % 1000000;
  let bc = bnum.toString().padStart(12, '0');
  item.barcode = '2' + bc;
  item.materialTypeId = '1a54b431-2e4f-452d-9cae-9cee66c9a892';
  item.status = {};
  item.status.name = 'Available';
  item.permanentLoanTypeId = '2b94c631-fca9-4892-a730-03ee529ffe27';
  item.metadata = meta;
  items.items.push(item);
});

const hString = JSON.stringify(holdings, null, 2);
const hFile = `${path}_holdings.json`;
fs.writeFileSync(hFile, hString);

const iString = JSON.stringify(items, null, 2);
const iFile = `${path}_items.json`;
fs.writeFileSync(iFile, iString);
