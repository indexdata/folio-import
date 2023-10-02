const fs = require('fs');
const readline = require('readline');
const uuid = require('uuid/v5');

const refDir = process.argv[2];
const mapFile = process.argv[3]
const sifFile = process.argv[4];

const getData = (record, offset, length, format) => {
  let start = offset;
  let end = start + length;
  let data = record.substring(start, end);
  data = data.trim();
  if (data) {
    if (format === 'n') {
      data = data.replace(/^0+/, '');
    }
    if (format === 'd') {
      data = data.replace(/(\d{4})(\d\d)(\d\d)/g, '$1-$2-$3');
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

  let begin = new Date().valueOf();

  const fileStream = fs.createReadStream(sifFile);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  let total = 0;
  rl.on('line', r => {
    total++;
    let ai = {};
    ai.bid = getData(r, 0, 9);
    ai.iseq = getData(r, 9, 6, 'n');
    ai.bc = getData(r, 14, 30, 'n');
    ai.subLib = getData(r, 44, 5);
    ai.mat = getData(r, 49, 5);
    ai.stat = getData(r, 55, 2);
    ai.odate = getData(r, 57, 8, 'd');
    ai.udate = getData(r, 65, 8, 'd');
    ai.coll = getData(r, 119, 5);
    ai.bccnType = getData(r, 124, 1);
    ai.cn = getData(r, 125, 80);
    ai.cnType2 = getData(r, 285, 1);
    ai.cn2 = getData(r, 286, 80);
    ai.vol = getData(r, 366, 200);
    ai.pubNote = getData(r, 566, 200);
    ai.circNote = getData(r, 766, 200);
    console.log(ai);
    
  });
  rl.on('close', () => {
    let end = new Date().valueOf()
    let tt = (end - begin)/1000;
    console.log('Done!');
    console.log('Total time (secs):', tt);
  });
} catch (e) {
  console.error(e.message);
}
