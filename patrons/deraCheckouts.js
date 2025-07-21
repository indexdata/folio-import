const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');
const readline = require('readline');

let circFile = process.argv[2];

const inFiles = { 
  sp: 'service-points.jsonl',
  item: 'items.jsonl',
  user: 'users.jsonl'
};

const outFiles = {
  co: 'checkouts.jsonl',
  ia: 'inactive-checkouts.jsonl'
};

const day = new Date('1970-01-02').valueOf();
const y1900 = new Date('1900-01-01').valueOf();

(async () => {
  try {
    if (!circFile) {
      throw('Usage: node deraCheckouts.js <circ_file_csv>');
    }
    let circDir = path.dirname(circFile);
    const start = new Date().valueOf();

    for (let k in inFiles) {
      inFiles[k] = circDir + '/' + inFiles[k];
    }
    inFiles.circ = circFile;
    // throw(inFiles);

    for (let k in outFiles) {
      outFiles[k] = circDir + '/' + outFiles[k];
      if (fs.existsSync(outFiles[k])) fs.unlinkSync(outFiles[k]);
    }
    // throw(outFiles);

    const spMap = {};
    let spData = fs.readFileSync(inFiles.sp, { encoding: 'utf8' });
    spData.split(/\n/).forEach(l => {
      if (l) {
        let j = JSON.parse(l);
        spMap[j.code] = j.id;
        spMap[j.name] = j.id;
      }
    });
    // throw(spMap);

    // map users
    let fileStream = fs.createReadStream(inFiles.user);
    let rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });
    const users = {};
    for await (let line of rl) {
      let o = JSON.parse(line);
      let k = o.barcode;
      if (k) {
        users[k] = { active: o.active, ex: o.expirationDate || '' };
      }
    }
    // throw(users);

    // map items
    const items = {};
    fileStream = fs.createReadStream(inFiles.item);
    rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });
    for await (let line of rl) {
      let o = JSON.parse(line);
      let k = o.barcode;
      items[k] = { st: o.status.name };
    }
    // throw(items);
    
    const parseDate = (dstr, type) => {
      let dt = '';
      let dto;
      if (dstr.match(/\d{5}\.\d*/)) {
        let [ d, f ] = dstr.split(/\./);
        d = parseInt(d, 10)*day + y1900;
        f = parseInt(f, 10)/100000;
        d += day*f;
        dto = new Date(d);
      } else {
        dto = new Date(dstr);
      }
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

    let csv = fs.readFileSync(inFiles.circ, {encoding: 'utf8'});
    const inRecs = parse(csv, {
      columns: true,
      skip_empty_lines: true,
      delimiter: ',',
      bom: true
    });

    inRecs.forEach(r => {
      if (process.env.DEBUG) console.log(r);
      let loan = {};
      let ibc = r.BOOK_BARCODE;
      let item = items[ibc];
      let ubc = r.PATRON_BARCODE;
      let user = users[ubc];
      if (!user) {
        console.log(`ERROR no user found with barcode "${ubc}" (${r.PATRON_NAME})`);
        ttl.unf++;
        ttl.err++;
      } else if (!item) {
        console.log(`ERROR no item found with barcode "${ibc}"`);
        ttl.inf++;
        ttl.err++;
      } else if (item.st !== 'Available') {
        console.log(`ERROR item status for "${ibc}" is "${item.st}"`);
        ttl.ina++;
        ttl.err++;
      } else {
        loan.itemBarcode = ibc;
        loan.userBarcode = ubc;
        let ld = r.CHECKOUT_DATE;
        let ldate = parseDate(ld, 'loan');
        if (ldate) loan.loanDate = ldate;
        let dd = r.DUE_DATE;
        let ddate = parseDate(dd, 'due');
        if (ddate) loan.dueDate = ddate;
        loan.servicePointId = spMap.main;
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
          console.log(`ERROR service point not found for ${lib} (${iid} --> ${pid})`);
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
