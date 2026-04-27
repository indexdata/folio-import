const readline = require('readline');
const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');
let uuid;
try {
  uuid = require('uuid/v5');
} catch (e) {
  const { v5 } = require('uuid');
  uuid = v5;
}

const ns = '4566df4a-8d63-4317-aacc-1cdf56a2271d';
let inFile = process.argv[2];

const files = {
  co: 'checkouts',
  ia: 'inactive-checkouts'
};

const rfiles = {
  users: 'users.jsonl',
  sp: 'service-points.jsonl'
}

const writeOut = (fileName, data) => {
  let line = JSON.stringify(data) + "\n";
  fs.writeFileSync(fileName, line, { flag: 'a' });
}

const parseDate = (date) => {
  let out = '';
  try {
    out = new Date(date).toISOString();
  } catch (e) {
    console.log(e);
  }
  return(out);
}

(async () => {
  try {
    if (!inFile) throw 'Usage: node msmCirc.js <circ_csv_file>';
    if (!fs.existsSync(inFile)) throw `Can't find user file: ${inFile}!`;
    let dir = path.dirname(inFile);

    for (let f in files) {
      let path = `${dir}/${files[f]}.jsonl`;
      if (fs.existsSync(path)) fs.unlinkSync(path);
      files[f] = path;
    }
    // throw(files);

    const data = {};
    const p2bc = {}
    for (let f in rfiles) {
      data[f] = {};
      let fn = `${dir}/${rfiles[f]}`;
      console.log(`INFO Reading ${fn}`);
      let fileStream = fs.createReadStream(fn);
      let rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
      });
      for await (let line of rl) {
        let j = JSON.parse(line);
        if (j.barcode) {
          data[f][j.barcode] = j;
          if (j.customFields) {
            p2bc[j.customFields.legacyRecordNumber] = j.barcode
          }
        } else if (j.code) {
          data[f][j.code] = j.id;
          if (j.name) data[f][j.name] = j.id;
        }
      }
    }
    // throw(p2bc.p10317545);

    let csv = fs.readFileSync(inFile, {encoding: 'utf8'});
    inRecs = parse(csv, {
      columns: true,
      skip_empty_lines: true,
      relax_column_count: true,
      quote: '"',
      bom: true
    })
    // throw(inRecs);

    const today = new Date().valueOf();

    let spId = data.sp.CIRC;
    // throw(spId);

    const ttl = { count: 0, checkouts: 0, inactives: 0, errors: 0}
    for (let x = 0; x < inRecs.length; x++) {
      ttl.count++;
      let r = inRecs[x];
      if (process.env.DEBUG) console.log(r);
      let pnum = r['RECORD #(Patron)'];
      let ubc = r['P BARCODE'] || p2bc[pnum];
      let ibc = r['BARCODE'];
      let ld = r['OUT DATE'];
      let dd = r['DUE DATE'];
      if (!ubc) {
        console.log(`ERROR Patron barcode not found for ${pnum}`);
        ttl.errors++;
        continue;
      }
      if (!ibc) {
        console.log(`ERROR Item barcode not found in line ${ttl.count}`);
        ttl.errors++;
        continue;
      }
      let user = data.users[ubc];
      if (user) {
        let exp = user.expirationDate; 
        let ldStr = parseDate(ld);
        let ddStr = parseDate(dd);
        if (!ddStr) {
          console.log(`ERROR Invalid dueDate "${dd}"`);
          ttl.errors++;
          continue;
        } else {
          ddStr = ddStr.replace(/T.+/, 'T23:59:59.000Z');
        }
        if (!ldStr) {
          console.log(`ERROR Invalid loanDate "${ld}"`);
          ttl.errors++;
          continue;
        }
        let co = {
          userBarcode: ubc,
          itemBarcode: ibc,
          loanDate: ldStr,
          dueDate: ddStr,
          servicePointId: spId
        }
        if (exp) co.expirationDate = exp;
        if (process.env.DEBUG) console.log(co);
        writeOut(files.co, co);
        ttl.checkouts++;
        if (!user.active) {
          writeOut(files.ia, co);
          ttl.inactives++;
        }
      } else {
        console.log(`ERROR user not found with barcode "${ubc}" (${pnum})`);
        ttl.errors++;
      }
    } 

    const t = (new Date().valueOf() - today) / 1000;
    console.log('------------');
    console.log('Finished!');
    for (let k in ttl) {
      console.log(k, ttl[k]);
    }
    
  } catch (e) {
    console.log(e);
  }
})();
