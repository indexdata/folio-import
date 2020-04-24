const inFile = process.argv[2];
const items = require(inFile);

const userBarcode = '631888472578232';
const sp = '61c07098-b22a-4743-8646-bdefb541cccb';

const out = { checkouts: [] };
items.items.forEach(i => {
  let co = {
    itemBarcode: i.barcode,
    userBarcode: userBarcode,
    servicePointId: sp
  }
  out.checkouts.push(co);
});

console.log(JSON.stringify(out, null, 2));
