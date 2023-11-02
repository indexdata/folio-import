const fs = require('fs');
const readline = require('readline');
const path = require('path');

let usersFile = process.argv[2];
let itemsFile = process.argv[3];
let circDir = process.argv[4];
let etcDir = '../etc/pma';

const sp = '58350f6a-40aa-49ef-bac3-cefe5ede1439';
const sixmo = 182 * 24 * 60 * 60 * 1000;

const inFiles = {
  loans: 'z36.seqaa'
}

const files = {
  co: 'checkouts.jsonl',
  ia: 'inactive-checkouts.jsonl',
  er: 'errs.jsonl'
};

const ffiles = {
  loans: 'z36-fields.txt',
}

const fieldMap = (fmap, record) => {
  let f = {};
  for (let k in fmap) {
    let v = fmap[k];
    let d = record.substring(v[0], v[1]).trim();
    f[k] = d;
  }
  return f;
}

const writeJSON = (fn, data) => {
  const out = JSON.stringify(data) + "\n";
  fs.writeFileSync(fn, out, { flag: 'a' });
}

const dateParse = (date, time) => {
  let d = date.replace(/(....)(..)(..)/, '$1-$2-$3');
  let t = (time) ? time.replace(/^(..)(..)/, 'T$1:$2:00-04:00') : 'T23:59:00-04:00';
  return(d + t)
}

(async () => {
  try {
    if (!circDir) {
      throw new Error('Usage: $ node pmaLoans.js <users_file_jsonl> <items_file_jsonl> <loans_dir>');
    }
    if (!fs.existsSync(circDir)) {
      throw new Error('Can\'t find input file');
    }

    let begin = new Date().valueOf();
    let goLive = new Date('2023-11-13').valueOf();
    let sixMoLater = new Date(goLive + sixmo).toISOString();
    sixMoLater = sixMoLater.replace(/T.+/, 'T23:59:00-04:00')

    circDir = circDir.replace(/\/$/, '');

    for (let f in files) {
      let fullPath = circDir + '/' + files[f];
      if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
      files[f] = fullPath;
    }
    // console.log(files); return;

    const fmap = {};
    for (let ff in ffiles) {
      let file = etcDir + '/' + ffiles[ff];
      console.log(`Reading ${file}`);
      let fields = fs.readFileSync(file, { encoding: 'utf8' });
      let cstart = 0;
      fmap[ff] = {};
      fields.split(/\n/).forEach(f => {
        let d = f.match(/^.+?-(.+) PICTURE.*\((\d+).+/);
        if (d) {
          let k = d[1];
          let v = d[2]
          v = parseInt(v, 10);
          k = k.replace(/\W/g, '_');
          let cend = cstart + v;
          fmap[ff][k] = [ cstart, cend, v ];
          cstart = cend;
        }
      });
    }
    // console.log(fmap); return

    console.log('Mapping users...');
    const userMap = {};
    let fileStream = fs.createReadStream(usersFile);
    let rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });
    for await (let line of rl) {
      let u = JSON.parse(line);
      userMap[u.username] = { bc: u.barcode, ed: u.expirationDate, ac: u.active };
    }
    // console.log(userMap); return;

    console.log('Mapping items...');
    const itemMap = {};
    fileStream = fs.createReadStream(itemsFile);
    rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });
    for await (let line of rl) {
      let i = JSON.parse(line);
      itemMap[i.hrid] = i.barcode;
    }
    // console.log(itemMap); return;


    fileStream = fs.createReadStream(`${circDir}/${inFiles.loans}`);
    rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });

    let err = 0;
    let ttl = 0;
    let chc = 0;
    let iac = 0;
    for await (let line of rl) {
      ttl++
      let j = fieldMap(fmap.loans, line);
      let un = j.ID;
      let user = userMap[un];
      if (user) {
        let seq = j.ITEM_SEQUENCE.replace(/^..(.+).$/, '$1');
        let ikey = j.DOC_NUMBER + '-' + seq;
        let ibc = itemMap[ikey];
        if (ibc) {
          let l = {
            itemBarcode: ibc,
            userBarcode: user.bc,
            servicePointId: sp
          };
          let ldate = j.LOAN_DATE || '';
          let ltime = j.LOAN_HOUR || '';
          l.loanDate = dateParse(ldate, ltime); 
          let ddate = j.DUE_DATE || '';
          let dtime = j.DUE_HOUR || '';
          l.dueDate = dateParse(ddate, '2359');
          if (l.dueDate < '2023-11-13T23:59:00-05:00') l.dueDate = sixMoLater;
          let rc = (j.NO_RENEWAL) ? parseInt(j.NO_RENEWAL, 10) : '0'; 
          l.renewalCount = rc;
          writeJSON(files.co, l);
          if (!user.ac) {
            writeJSON(files.ia, l);
            iac++;
          }
          chc++;
        } else {
          console.log('ERROR No item found for:', ikey);
          j.errMsg = 'Item not found';
          writeJSON(files.er, j);
          err++;
        }
      } else {
        console.log('ERROR user not found for', un);
        j.errMsg = 'User not found';
        writeJSON(files.er, j);
        err++;
      }
    }
    console.log('Lines processed:', ttl);
    console.log('Checkouts created', chc);
    console.log('Inactive users', iac);
    console.log('Errors', err);

  } catch (e) {
    console.error(e.message);
  }
})();
