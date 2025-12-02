/*
  This script requires the following jsonl files:
  1) adm2pol.jsonl -- admin number to FOLIO po-line ID map
  2) titles.jsonl -- FOLIO orders titles from orders-storage/titles (run node downloadJSON.js orders-storage/titles <orders_dir>/titles.jsonl)
*/

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

const ns = '3eb5d7ac-7f51-4922-bd58-512a1f9710ac';
const tstr = 'KB Stående order';
let inFile = process.argv[2];

const files = {
  s: 'serials',
  r: 'ruleSetRaw'
};

const ifiles = {
  a: 'adm2pol.jsonl',
  t: 'titles.jsonl'
}

let newDate = new Date();
let start = newDate.valueOf();

const months = [ '', 'january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december' ];

const writeOut = (fileName, data) => {
  let line = JSON.stringify(data) + "\n";
  fs.writeFileSync(fileName, line, { flag: 'a' });
}

const makeRules = (ptype, idate, interval) => {
  let reps = interval.iov;
  let out = [];
  for (let x = 0; x < reps; x++) {
    let o = { pattern: {}, patternType: ptype };
    o.ordinal = 1;
    o.pattern.day = idate.d;
    if (ptype === 'year_date') {
      if (x > 0) idate.mv += interval.count;
      o.pattern.month = { value: months[idate.mv] };
    }
    out.push(o);
  }
  
  return out;
}

(async () => {
  try {
    if (!inFile) throw 'Usage: node nlsSerials <z08_table>';
    ordDir = path.dirname(inFile);
    console.log(`Start: ${newDate}`);

    for (let f in files) {
      let path = `${ordDir}/${files[f]}.jsonl`;
      if (fs.existsSync(path)) fs.unlinkSync(path);
      files[f] = path;
    }

    const d = {};
    for (let f in ifiles) {
      let path = ordDir + '/' + ifiles[f];
      console.log(`Reading ${path}`);
      d[f] = {};
      let fileStream = fs.createReadStream(path);
      let rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
      });
      for await (let line of rl) {
        let j = JSON.parse(line);
        let k = (f === 't') ? j.poLineId : j.adm;
        let v = (f === 't') ? j : j.polId;
        d[f][k] = v;
      }
    }
    // throw(d);
    const ttl = {
      serials: 0,
      errors: 0
    }

    let csv = fs.readFileSync(inFile, {encoding: 'utf8'});
    let lines = parse(csv, {
      columns: true,
      skip_empty_lines: true,
      delimiter: '\t',
      relax_column_count: true,
      quote: null,
      trim: true,
      bom: true
    });
    lines.forEach(r => {
      // console.log(r);
      let rk = r.Z08_REC_KEY;
      let tu = (r.Z08_VOLUME_PERIOD_TYPE === 'Y') ? 'year' : 'month';
      let per = r.Z08_VOLUME_PERIOD;
      let ipv = r.Z08_NO_ISSUE_PER_VOLUME;
      let interval = { type: r.Z08_INTERVAL_TYPE, count: parseInt(r.Z08_INTERVAL_COUNT, 10), iov: parseInt(r.Z08_NO_ISSUE_OVER_VOLUME) };
      let idate = {};
      let dateStr = r.Z08_ISSUE_DATE;
      if (dateStr) {
        idate.y = dateStr.substring(0, 4);
        idate.m = dateStr.substring(4, 6);
        idate.d = dateStr.substring(6, 8);
      }
      for (let k in idate) {
        idate[k] = idate[k].replace(/^0/, '');
        idate[k + 'v'] = parseInt(idate[k], 10);
      }
      let ptype = (tu === 'year') ? 'year_date' : 'month_date';
      let polId = d.a[rk];
      if (polId) {
        let t = d.t[polId];
        let so = {
          id: t.poLineNumber,
          serialStatus: { value: 'active' },
          orderLine: {
            remoteId: polId,
            title: t.title,
            titleId: t.id
          }
        }
        writeOut(files.s, so);
        ttl.serials++;

        let rs = {
          owner: { id: so.id },
          rulesetStatus: { value: 'active' },
          recurrence: {
            timeUnit: { value: tu },
            period: per,
            issues: ipv,
          },
          
        }

        rs.recurrence.rules = makeRules(ptype, idate, interval);

        writeOut(files.r, rs);
        // console.log(JSON.stringify(rs, null, 2))
      }
      else {
        console.log(`ERROR PO-line not found for ${rk}`);
        ttl.errors++;
      }
    });

    console.log('----------------');
    for (let k in ttl) {
      console.log(k, ttl[k]);
    }
  } catch (e) {
    console.log(e);
  }
})();
