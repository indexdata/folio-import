const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');
const readline = require('readline');

let circFile = process.argv[2];

const inFiles = { 
  sp: 'service-points.json',
  item: 'items.jsonl',
  user: 'users.jsonl'
};

const outFiles = {
  co: 'checkouts.jsonl',
  ia: 'inactive-checkouts.jsonl'
};

const lib2sp = {
  "MIDVALLEY": "MVLIB",
  "NAH": "NAHLIB",
  "NURSING": "NAHLIB",
  "PECAN": "PCNLIB",
  "PHARR": "RCPSELIB",
  "RIO_GRANDE": "STRLIB",
  "TECHLIB": "TECHLIB"
};

(async () => {
  try {
    if (!circFile) {
      throw('Usage: node stcCheckouts.js <circ_file_csv>');
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

    const sp = require(inFiles.sp);
    spMap = {};
    sp.servicepoints.forEach(s => {
      s.code = s.code.trim();
      spMap[s.code] = s.id;
    });
    // throw(spMap);

    for (k in lib2sp) {
      let sid = spMap[lib2sp[k]];
      lib2sp[k] = sid;
    }
    // throw(lib2sp);

    // map users
    let fileStream = fs.createReadStream(inFiles.user);
    let rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });
    const users = {};
    for await (let line of rl) {
      let o = JSON.parse(line);
      let k = (o.username) ? o.username.toLowerCase() : '';
      users[k] = { bc: o.barcode, active: o.active, ex: o.expirationDate || '' };
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
    
    const dateOffset = (dt) => {
      let dzo = new Date(dt).getTimezoneOffset();
      let pto = ((dzo+0)/60);  // change this value according to the local machine that runs the script.
      out = `-0${pto}:00`;
      return out; 
    }

    const parseDate = (dstr) => {
      let dt = dstr.replace(/^(....)(..)(..)(..)(..)/, '$1-$2-$3T$4:$5:00');
      let out;
      try {
        let off = dateOffset(dt);
        out = dt + off;
      } catch (e) {
        console.log(`${e}`);
      }
      return(out);
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
      delimiter: '|'
    });

    inRecs.forEach(r => {
      if (process.env.DEBUG) console.log(r);
      let loan = {};
      let iid = r.ITEM_ID.trim();
      let pid = r.USERNAME.trim().toLowerCase();
      let item = items[iid];
      let user = users[pid];
      if (!user) {
        console.log(`ERROR no user found for username ${pid}`);
        ttl.unf++;
        ttl.err++;
      } else if (!item) {
        console.log(`ERROR no item found for barcode ${iid}`);
        ttl.inf++;
        ttl.err++;
      } else if (item.st !== 'Available') {
        console.log(`ERROR item status for ${iid} is not available`);
        ttl.ina++;
        ttl.err++;
      } else {
        loan.itemBarcode = iid;
        loan.userBarcode = user.bc;
        loan.username = user.un;
        let ld = r.CHARGE_DATE;
        let ldate = parseDate(ld);
        if (ldate) loan.loanDate = ldate;
        let dd = r.DUE_DATE;
        let ddate = parseDate(dd);
        if (ddate) loan.dueDate = ddate;
        let lib = r.CHARGE_LIBRARY;
        loan.servicePointId = lib2sp[lib];
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
