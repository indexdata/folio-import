const fs = require('fs');
const readline = require('readline');
const path = require('path');
const jsonlFile = process.argv[2];

try {
  if (!jsonlFile) {
    throw new Error('Usage: node makeDukeInventory.js <jsonl_file>');
  }

  const fi = path.parse(jsonlFile);
  const wd = fi.dir;
  const fn = fi.name;
  let fileSize = 100;

  let c = 0;

  var rl = readline.createInterface({
    input: fs.createReadStream(jsonlFile),
    crlfDelay: Infinity,
  });

  rl.on('line', function (line) {
    c++;
    console.log(`Rec# ${c}`);
    let json = JSON.parse(line);
    insts.instances.push(json.bibInv);
    srs.records.push(json.bibSource);
    json.holdings.forEach(h => {
      holds.holdingsRecords.push(h.invHold);
      h.items.forEach(i => {
        items.items.push(i);
      })
    })
  });

  rl.on('close', () => {
    const instFile = `${wd}/${fn}_instances.json`;
    const holdFile = `${wd}/${fn}_holdings.json`;
    const itemFile = `${wd}/${fn}_items.json`;
    const srsFile = `${wd}/${fn}_srs.json`;
    fs.writeFileSync(instFile, JSON.stringify(insts, null, 2));
    fs.writeFileSync(holdFile, JSON.stringify(holds, null, 2));
    fs.writeFileSync(itemFile, JSON.stringify(items, null, 2));
    fs.writeFileSync(srsFile, JSON.stringify(srs, null, 2));
  });
  


} catch (e) {
  console.log(e.message);
}