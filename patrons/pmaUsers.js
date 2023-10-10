const fs = require('fs');
const readline = require('readline');
const uuid = require('uuid/v5');
const path = require('path');

const refDir = process.argv[2];
const sifFile = process.argv[3];

const ns = '53fdafa5-df44-4e0a-a9af-c3740938f5ff';

const files = {
  users: 'users.jsonl'
};

const rfiles = {
  addressTypes: 'addresstypes.json',
  usergroups: 'groups.json',
  noteTypes: 'note-types.json'
};

const tfiles = {
  usergroups: 'groups.tsv'
};

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
}

const writeJSON = (fn, data) => {
  const out = JSON.stringify(data) + "\n";
  fs.writeFileSync(fn, out, { flag: 'a' });
}

try {
  if (!sifFile) {
    throw new Error('Usage: $ node pmaUsers.js <ref_dir> <z30_file>');
  }
  if (!fs.existsSync(sifFile)) {
    throw new Error('Can\'t find input file');
  }

  let begin = new Date().valueOf();

  let dir = path.dirname(sifFile);
  let base = path.basename(sifFile, '.seqaa');

  for (let f in files) {
    let fullPath = dir + '/' + base + '-' + files[f];
    if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
    files[f] = fullPath;
  }

  let refData = {};
  for (let prop in rfiles) {
    let rpath = refDir + '/' + rfiles[prop];
    let refObj = require(rpath);
    let arr = refObj[prop];
    refData[prop] = {}
    arr.forEach(e => {
      let key = e.addressType || e.group || e.name;
      let id = e.id;
      refData[prop][key] = id;
    });
  }
  // console.log(refData); return;

  const tmap = {};
  for (let prop in tfiles) {
    let tpath = refDir + '/' + tfiles[prop];
    let tdata = fs.readFileSync(tpath, { encoding: 'utf8'});
    let arr = tdata.split(/\n/);
    arr.shift();
    tmap[prop] = {}
    arr.forEach(e => {
      let c = e.split(/\t/);
      let key = c[0];
      let val = c[1] || 'unspecified';
      tmap[prop][key] = (refData[prop]) ? refData[prop][val] : val;
    });
  }
  // console.log(tmap); return;

  bseen = {};
  hseen = {};
  bcused = {};

  const makeUser = (ai) => {
    out = {};
    return out;
  }

  const main = () => {
    fileStream = fs.createReadStream(sifFile);
    rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });

    let total = 0;
    let urc = 0;
    let irc = 0;
    rl.on('line', r => {
      total++;
      let id = getData(r, 0, 12);
      let userId = uuid(id, ns);
      let proxyId = getData(r, 12, 12);
      let primId = getData(r, 24, 12);
      let nameKey = getData(r, 36, 50);
      let userType = getData(r, 86, 5);
      let oDate = getData(r, 96, 8, 'd');
      let name = getData(r, 116, 200);
      let notes = [];
      notes.push(getData(r, 1073, 200));
      notes.push(getData(r, 1273, 200));
      notes.push(getData(r, 1473, 200));
      notes.push(getData(r, 1673, 200));
      notes.push(getData(r, 1873, 200));
      let ai = {
        aleph: {
          uid: id,
          nk: nameKey,
          ut: userType,
          odate: oDate,
          name: name,
          notes: notes
        },
        id: userId
      };
      console.log(ai);
      if (total%10000 === 0) console.log('Records processed:', total);
    });
    rl.on('close', () => {
      let end = new Date().valueOf()
      let tt = (end - begin)/1000;
      console.log('Done!');
      console.log('Lines processed:', total);
      console.log('Holdings:', urc);
      console.log('Items:', irc);
      console.log('Total time (secs):', tt);
    });
  }

  main();

} catch (e) {
  console.error(e.message);
}
