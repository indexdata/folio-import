const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');
const readline = require('readline');

let spFile = process.argv[2];
let usersFile = process.argv[3];
let itemFile = process.argv[4];
let circFile = process.argv[5];

const outFiles = {
  co: 'checkouts.jsonl',
  ia: 'inactive-checkouts.jsonl'
};

const day = new Date('1970-01-02').valueOf();
const y1900 = new Date('1900-01-01').valueOf();

(async () => {
  try {
    if (!circFile) {
      throw('Usage: node nlsCheckouts.js <servicepoints_file> <users_jsonl_file> <items_jsonl_file> <z36_table>');
    }
    let circDir = path.dirname(circFile);
    const start = new Date().valueOf();

    for (let k in outFiles) {
      outFiles[k] = circDir + '/' + outFiles[k];
      if (fs.existsSync(outFiles[k])) fs.unlinkSync(outFiles[k]);
    }
    // throw(outFiles);

    const spMap = {};
    let sp = require(spFile);
    sp.servicepoints.forEach(j => {
        spMap[j.code] = j.id;
        spMap[j.name] = j.id;
    });
    // throw(spMap);

    // map users
    let fileStream = fs.createReadStream(usersFile);
    let rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });
    const users = {};
    for await (let line of rl) {
      let o = JSON.parse(line);
      let k = (o.customFields) ? o.customFields.alephid : '';
      if (k) {
        users[k] = { active: o.active, bc: o.barcode, ex: o.expirationDate || '' };
      }
    }
    // throw(users);

    // map items
    const items = {};
    fileStream = fs.createReadStream(itemFile);
    rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });
    for await (let line of rl) {
      let o = JSON.parse(line);
      let k = o.hrid;
      items[k] = { bc: o.barcode, st: o.status.name };
    }
    // throw(items['001158172001030']);
    
    const parseDate = (dstr, type) => {
      let dt = '';
      dstr = dstr.replace(/^(....)(..)(..)/, '$1-$2-$3');
      let dto = new Date(dstr)
      try {
        let dzo = (dto.getTimezoneOffset() - 60)/60;
	      if (dzo < 0) dzo = 6 + dzo
        let pto = `-0${dzo}:00`;
        dt = dto.toISOString();
        dt = (type === 'due') ? dt.replace(/T.+/, `T23:59:59.000${pto}`) : dt.replace(/T.+/, `T12:00:00.000${pto}`);
      } catch (e) {
        console.log(`${e} : ${dstr}`);
      }
      return(dt);
    }

    const writeOut = (file, obj) => {
      fs.writeFileSync(file, JSON.stringify(obj) + '\n', { flag: 'a'});
    };

    const ttl = {
      co: 0,
      ia: 0,
      unf: 0,
      inf: 0,
      ina: 0,
      ibc: 0,
      err: 0,
    }

    let csv = fs.readFileSync(circFile, {encoding: 'utf8'});
    const inRecs = parse(csv, {
      columns: true,
      skip_empty_lines: true,
      delimiter: '\t',
      bom: true
    });

    inRecs.forEach(r => {
      if (process.env.DEBUG) console.log(r);
      let loan = {};
      let lib = r.Z36_SUB_LIBRARY;
      let iid = r.Z36_REC_KEY;
      let item = items[iid];
      let uid = r.Z36_ID.trim();
      let user = users[uid];
      if (!user) {
        console.log(`ERROR no user found with alephId "${uid}" (${r.PATRON_NAME})`);
        ttl.unf++;
        ttl.err++;
      } else if (!item) {
        console.log(`ERROR no item found with hrid "${iid}"`);
        ttl.inf++;
        ttl.err++;
      } else if (item.st !== 'Available') {
        console.log(`ERROR item status for "${iid}" is "${item.st}"`);
        ttl.ina++;
        ttl.err++;
      } else {
        loan.itemBarcode = item.bc;
        loan.userBarcode = user.bc;
        let ld = r.Z36_LOAN_DATE;
        let ldate = parseDate(ld, 'loan');
        if (ldate) loan.loanDate = ldate;
        let dd = r.Z36_DUE_DATE;
        let ddate = parseDate(dd, 'due');
        if (ddate) loan.dueDate = ddate;
        loan.servicePointId = spMap['SP-INFO'];
        if (r.RENEWAL_COUNT) loan.renewalCount = parseInt(r.RENEWAL_COUNT, 10);
        if (user.ex) loan.expirationDate = user.ex;
        if (loan.servicePointId) {
          writeOut(outFiles.co, loan);
          ttl.co++;
          if (!user.active) {
            writeOut(outFiles.ia, loan);
            ttl.ia++;
          }
        } else {
          console.log(`ERROR service point not found for "${lib}" (${item.bc} --> ${uid})`);
          ttl.err++;
        }
      }
    });

    const end = new Date().valueOf();
    const time = (end - start)/1000;
    console.log('Checkouts:', ttl.co);
    console.log('Inactives:', ttl.ia);
    console.log('Users not found:', ttl.unf);
    console.log('Items not found:', ttl.inf);
    console.log('Items not available:', ttl.ina);
    console.log('Items with no barcode:', ttl.ibc);
    console.log('Total errors:', ttl.err);
    console.log('Time (sec):', time);
  } catch (e) {
    console.error(e);
  }
})();
