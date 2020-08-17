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
  let fileSize = 500000;
  let srsSize = 1000;
  let pad = 8;
  let instFile;
  let holdFile;
  let itemFile;
  let srsFile;

  let c = 0;
  let fc = 0;
  let sfc = 0;
  let h = 0;
  let hfc = 0;
  let i = 0;
  let ifc = 0;
  let cmod;
  let smod;
  let hmod;
  let imod;

  var rl = readline.createInterface({
    input: fs.createReadStream(jsonlFile),
    crlfDelay: Infinity,
  });

  rl.on('line', function (line) {
    c++;
    console.log(`Rec# ${c}`);
    cmod = c % fileSize;
    smod = c % srsSize;
    let json = JSON.parse(line);
    let inst = JSON.stringify(json.bibInv);
    let srs = JSON.stringify(json.bibSource);
    if (cmod === 1) {
      let part = fc.toString(10);
      part = part.padStart(pad, '0');
      fc++;
      instFile = `${wd}/${fn}_instances${part}.json`;
      fs.writeFileSync(instFile, '{ "instances": [ ' + inst);
    }
    else if (cmod === 0) {
      fs.appendFileSync(instFile, ',\n' + inst + ' ] }\n');
    } else {
      fs.appendFileSync(instFile, ',\n' + inst);
    }

    if (smod === 1) {
      let part = sfc.toString(10);
      part = part.padStart(pad, '0');
      sfc++;
      srsFile = `${wd}/${fn}_srs${part}.json`;
      fs.writeFileSync(srsFile, '{ "records": [ ' + srs);
    }
    else if (smod === 0) {
      fs.appendFileSync(srsFile, ',\n' + srs + ' ] }\n');
    } else {
      fs.appendFileSync(srsFile, ',\n' + srs);
    }

    json.holdings.forEach(hold => {
      h++;
      let holdings = JSON.stringify(hold.invHold);
      hmod = h % fileSize;
      if (hmod === 1) {
        let part = hfc.toString(10);
        part = part.padStart(pad, '0');
        hfc++;
        holdFile = `${wd}/${fn}_holdings${part}.json`;
        itemFile = `${wd}/${fn}_items${part}.json`;
        fs.writeFileSync(holdFile, '{ "holdingsRecords": [ ' + holdings);
      }
      else if (hmod === 0) {
        fs.appendFileSync(holdFile, ',\n' + holdings + ' ] }\n');
      } else {
        fs.appendFileSync(holdFile, ',\n' + holdings);
      }
      hold.items.forEach(it => {
        i++;
        let item = JSON.stringify(it);
        imod = i % fileSize;
        if (imod === 1) {
          let part = ifc.toString(10);
          part = part.padStart(pad, '0');
          ifc++;
          itemFile = `${wd}/${fn}_items${part}.json`;
          fs.writeFileSync(itemFile, '{ "items": [ ' + item);
        }
        else if (imod === 0) {
          fs.appendFileSync(itemFile, ',\n' + item + ' ] }\n');
        } else {
          fs.appendFileSync(itemFile, ',\n' + item);
        }
      });
    });
  });

  rl.on('close', () => {
    if (cmod) fs.appendFileSync(instFile, ' ] }\n');
    if (smod) fs.appendFileSync(srsFile, ' ] }\n');
    if (hmod) fs.appendFileSync(holdFile, ' ] }\n');
    if (imod) fs.appendFileSync(itemFile, ' ] }\n');
  });

} catch (e) {
  console.log(e.message);
}