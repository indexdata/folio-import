const fs = require('fs');
const readline = require('readline');
const uuid = require('uuid/v5');

const refDir = process.argv[2];
const mapFile = process.argv[3]
const sifFile = process.argv[4];

const getData = (record, offset, length, format) => {
  const start = offset;
  const end = start + length;
  let data = record.substring(start, end);
  data = data.trim();
  if (data) {
    if (format === 'n') {
      data = data.replace(/^0+/, '');
    }
    if (format === 'd') {
      data = data.replace(/\./g, '-');
      // data += 'T00:00.000+0000';
    }
  }
  return data;
};

try {
  if (sifFile === undefined) {
    throw new Error('Usage: $ node items-pma.sh <ref_dir> <inst_map> <z30_file>');
  }
  if (!fs.existsSync(sifFile)) {
    throw new Error('Can\'t find input file');
  }

  const fileStream = fs.createReadStream(sifFile);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  let total = 0;
  rl.on('line', r => {
    total++;
    let bid = getData(r, 0, 9);
    let iseq = getData(r, 9, 5, 'n');
    let bc = getData(r, 14, 29, 'n');
    let subLib = getData(r, 16)
    console.log(bid, iseq, bc);

  });
  rl.on('close', () => {
    console.log('Done!');
  });
} catch (e) {
  console.error(e.message);
}
