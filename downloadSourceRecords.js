const fs = require('fs');
const superagent = require('superagent');
const { getAuthToken } = require('./lib/login');
const argv = require('minimist')(process.argv.slice(2));
const { Buffer } = require('node:buffer');

let refDir = argv._[0];
let size = parseInt(argv.s, 10) || 10000;
let offset = parseInt(argv.o, 10) || 0;

const mij2raw = (mij, sortFieldsByTag) => {
  let dir = '';
  let pos = 0;
  let varFields = '';
  if (sortFieldsByTag) mij.fields.sort((a, b) => Object.keys(a)[0] - Object.keys(b)[0]);
  mij.fields.forEach(f => {
    let tag = Object.keys(f)[0];
    let data = '';
    if (f[tag].subfields) {
      let d = f[tag];
      data = d.ind1 + d.ind2;
      d.subfields.forEach(s => {
        let code = Object.keys(s)[0];
        let sd = s[code];
        data += '\x1F' + code + sd;
      });
    } else {
      data = f[tag];
    }
    data += '\x1E';
    varFields += data;
    let len = Buffer.byteLength(data, 'utf8');
    let lenStr = len.toString().padStart(4, '0');
    let posStr = pos.toString().padStart(5, '0');
    let dirPart = tag + lenStr + posStr;
    dir += dirPart;
    pos += len;
  });
  let ldr = mij.leader;
  dir += '\x1E';
  let base = dir.length + 24;
  let baseStr = base.toString().padStart(5, '0');
  ldr = ldr.replace(/^\d{5}(.{7})\d{5}(.+)/, '$1' + baseStr + '$2');
  let rec = ldr + dir + varFields + '\x1D';
  let rlen = Buffer.byteLength(rec, 'utf8') + 5;
  let rlinStr = rlen.toString().padStart(5, '0');
  rec = rlinStr + rec;
  return rec;
}

(async () => {
  try {
    if (!refDir) {
      throw new Error('Usage: node downloadSourceRecords.js [ -s collection size, -l jsonl output, -m marc output, -o offset ] <download_dir>');
    } else if (!fs.existsSync(refDir)) {
      throw new Error('Download directory does\'t exist!');
    } else if (!fs.lstatSync(refDir).isDirectory()) {
      throw new Error(`${refDir} is not a directory!`)
    }
    let config = await getAuthToken(superagent);

    refDir = refDir.replace(/\/$/,'');
    const jsonlFile = `${refDir}/records.jsonl`;
    const mrcFile = `${refDir}/records.mrc`;

    const actionUrl = `${config.okapi}/source-storage/records`;
    recObj = 'records';

    let totFetch = 0 + offset;
    let totRecs = 1000000;
    let perPage = 1000;
    let part = 0;
    const coll = { records: [] };
    if (argv.l && fs.existsSync(jsonlFile)) fs.unlinkSync(jsonlFile);
    if (argv.m && fs.existsSync(mrcFile)) fs.unlinkSync(mrcFile);
    while (totFetch < totRecs) {
      let url = `${actionUrl}?state=ACTUAL&limit=${perPage}&offset=${offset}&orderBy=updatedDate,DESC`;
      console.log(url);
      let startTime = new Date().valueOf();
      try {
        let res = await superagent
          .get(url)
          .timeout({response: 120000})
          .set('User-Agent', config.agent)
          .set('accept', 'application/json')
          .set('x-okapi-token', config.token);
        if (argv.l || argv.m) {
          let recs = res.body[recObj];
          let fn = jsonlFile || mrcFile;
          console.log(`Writing ${recs.length} records to ${fn}`)
          for (let x = 0; x < recs.length; x++) {
            if (argv.l) {
              let rec = JSON.stringify(recs[x]) + '\n';
              fs.writeFileSync(jsonlFile, rec, { flag: 'a'});
            } else {
              let raw = mij2raw(recs[x].parsedRecord.content, true);
              fs.writeFileSync(mrcFile, raw, {flag: 'a'});
            }
          }
        } else {
          coll.records = coll.records.concat(res.body[recObj]);
        }
        totFetch += res.body[recObj].length;
        totRecs = res.body.totalRecords; 
      } catch (e) {
        try {
          throw new Error(e.response.text);
        } catch {
          throw new Error(e.message);
        }
      }
      let endTime = new Date().valueOf();
      let sec = (endTime - startTime) / 1000;
      offset += perPage;
      console.log(`Received ${totFetch} of ${totRecs} records in ${sec} sec`);
      if ((totFetch % size == 0 || totFetch >= totRecs) && ! argv.l) {
        let saveSize = coll.records.length;
        let partPadded = part.toString().padStart(5, '0');
        let fn = `${refDir}/records${partPadded}.json`
        console.log(`Writing ${saveSize} records to ${fn}...`);
        const jsonStr = JSON.stringify(coll, null, 2);
        fs.writeFileSync(fn, jsonStr);
        coll.records = [];
        part++;
      }
    }
  } catch (e) {
    console.error(e.message);
  }
})();
