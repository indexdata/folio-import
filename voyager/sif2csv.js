const fs = require('fs');
const readline = require('readline');
const sifFile = process.argv[2];

const getData = (record, offset, length, format) => {
  const start = offset - 1;
  const end = start + length;
  let data = record.substring(start, end);
  data = data.trim();
  if (data) {
    if (format === 'n') {
      data = data.replace(/^0+$/, 'z');
      data = data.replace(/^0+/, '');
      data = data.replace(/^z$/, '0');
    } else if (data.match(/^\d{4}\.\d\d.\d\dXXXX/)) {
      data = data.replace(/\./g, '-');
      // data += 'T00:00.000+0000';
    } else {
      data = data.trim();
      data = data.replace(/"/g, '""');
      data = `"${data}"`;
    }
  }
  return data;
};

try {
  if (sifFile === undefined) {
    throw new Error('Usage: $ node sif2folio.js <sif_file> [ <folio_users_file> ]');
  }
  if (!fs.existsSync(sifFile)) {
    throw new Error('Can\'t find input file');
  }
  const fileStream = fs.createReadStream(sifFile);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });
  const records = {};
  records.users = [];
  let header = [
    { h: 'patron id', l: 10, t: 'n' },
    { h: 'patron barcode id 1', l: 10, t: 'n' },
    { h: 'patron barcode 1', l: 25 },
    { h: 'patron group 1', l: 10 },
    { h: 'barcode status 1', l: 1, t: 'n' },
    { h: 'barcode modified date 1', l: 10 },
    { h: 'patron barcode id 2', l: 10, t: 'n' },
    { h: 'patron barcode 2', l: 25 },
    { h: 'patron group 2', l: 10 },
    { h: 'barcode status 2', l: 1, t: 'n' },
    { h: 'barcode modified date 2', l: 10 },
    { h: 'patron barcode id 3', l: 10, t: 'n' },
    { h: 'patron barcode 3', l: 25 },
    { h: 'patron group 3', l: 10 },
    { h: 'barcode status 3', l: 1, t: 'n' },
    { h: 'barcode modified date 3', l: 10 },
    { h: 'registration date', l: 10 },
    { h: 'patron exp date', l: 10 },
    { h: 'patron purge date', l: 10 },
    { h: 'voyager date', l: 10 },
    { h: 'voyager updated', l: 10 },
    { h: 'circ happening loc code', l: 10 },
    { h: 'instituion ID', l: 30 },
    { h: 'ssn', l: 11 },
    { h: 'statcat 1', l: 3 },
    { h: 'statcat 2', l: 3 },
    { h: 'statcat 3', l: 3 },
    { h: 'statcat 4', l: 3 },
    { h: 'statcat 5', l: 3 },
    { h: 'statcat 6', l: 3 },
    { h: 'statcat 7', l: 3 },
    { h: 'statcat 8', l: 3 },
    { h: 'statcat 9', l: 3 },
    { h: 'statcat 10', l: 3 },
    { h: 'name type', l: 1, t: 'n' },
    { h: 'surname', l: 30 },
    { h: 'first name', l: 20 },
    { h: 'middle name', l: 20 },
    { h: 'title', l: 10 },
    // { h: 'historical charges', l: 10 },
    { h: 'claims returned count', l: 5, t: 'n' },
    { h: 'self shelved count', l: 5, t: 'n' },
    { h: 'lost items count', l: 5, t: 'n' },
    { h: 'late media returns', l: 5, t: 'n' },
    { h: 'historical bookings', l: 5, t: 'n' },
    { h: 'late media returns', l: 5, t: 'n' },
    { h: 'historical bookings', l: 5, t: 'n' },
    { h: 'canceled bookings', l: 5, t: 'n' },
    { h: 'unclaimed bookings', l: 5, t: 'n' },
    { h: 'historical callslips', l: 5, t: 'n' },
    { h: 'historical distributions', l: 5, t: 'n' },
    { h: 'historical short loans', l: 5, t: 'n' },
    { h: 'unclaimed short loans', l: 5, t: 'n' },
    { h: 'address count', l: 1, t: 'n' },
    { addresses: [
      { h: 'address id', l: 10, t: 'n' },
      { h: 'address type', l: 1, t: 'n' },
      { h: 'address status code', l: 1 },
      { h: 'address begin date', l: 10 },
      { h: 'address end date', l: 10 },
      { h: 'address line 1', l: 50 },
      { h: 'address line 2', l: 40 },
      { h: 'address line 3', l: 40 },
      { h: 'address line 4', l: 40 },
      { h: 'address line 5', l: 40 },
      { h: 'city', l: 40 },
      { h: 'state code', l: 7 },
      { h: 'zipcode', l: 10 },
      { h: 'country', l: 20 },
      { h: 'phone primary', l: 25 },
      { h: 'phone moblie', l: 25 },
      { h: 'phone fax', l: 25 },
      { h: 'phone other', l: 25 },
      { h: 'date updated', l: 10 }
    ] }
  ];
  let out = [];
  let hd = [];
  let aCount = 4;
  header.forEach(h => {
    if (h.addresses) {
      for (let x = 1; x <= aCount; x++) {
        h.addresses.forEach(h => {
          hd.push(`${h.h} (${x})`);
        });
      }
    } else {
      hd.push(h.h);
    }
  });
  out.push(hd.join(','));
  rl.on('line', r => {
    let u = [];
    let start = 1;
    let aCount = 0;
    header.forEach(h => {
      if (h.h === 'address count') {
        aCount = parseInt(getData(r, start, h.l, 'n'), 10);
      }
      if (h.addresses) {
        for (let x = 1; x <= aCount; x++) {
          h.addresses.forEach(h => {
            u.push(getData(r, start, h.l, h.t));
            start += h.l;
          });
        }
      } else {
        u.push(getData(r, start, h.l, h.t));
      }
      start += h.l;
    });
    out.push(u.join(','));
  });
  rl.on('close', () => {
    out.forEach(o => {
      console.log(o);
    });
  });
} catch (e) {
  console.error(e.message);
}
