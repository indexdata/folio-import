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
let refDir = process.argv[2];
let ordDir = process.argv[3]

const files = {
  o: 'composite-orders',
  p: 'purchase-orders',
  l: 'order-lines'
};

const zfiles = {
  oo: 'open-orders.csv',
  z68: 'z68.dsv',
  z16: 'z16.dsv',
  z104: 'z104.dsv',
  z78: 'z78.dsv'
};

const curYear = new Date().getFullYear();

const writeOut = (fileName, data) => {
  let line = JSON.stringify(data) + "\n";
  fs.writeFileSync(fileName, line, { flag: 'a' });
}

try {
  if (!ordDir) throw 'Usage: node nlsOrders.js <ref_dir> <orders_dir>';
  refDir = refDir.replace(/\/$/, '');
  ordDir = ordDir.replace(/\/$/, '');

  for (let f in files) {
    let path = `${ordDir}/${files[f]}.jsonl`;
    if (fs.existsSync(path)) fs.unlinkSync(path);
    files[f] = path;
  }
  // throw(files);

  const refData = {};
  let rfiles = fs.readdirSync(refDir);
  rfiles.forEach(f => {
    if (f.match(/\.json$/)) {
      let p = refDir + '/' + f;
      let j = require(p);
      let prop = '';
      for (let k in j) {
        if (k !== 'totalRecords') {
          prop = k;
        }
      }
      refData[prop] = {};
      j[prop].forEach(d => {
        let n = d.name || d.templateName || d.value;
        let c = d.code || d.templateCode;
        if (n) refData[prop][n] = d.id;
        if (c) refData[prop][c] = d.id;
      });
    }
  });
  // throw(refData);

  const d = {};
  for (let f in zfiles) {
    let path = ordDir + '/' + zfiles[f];
    console.log(`Reading ${path}`);
    d[f] = {};
    let csv = fs.readFileSync(path, {encoding: 'utf8'});
    let lines = parse(csv, {
      columns: true,
      skip_empty_lines: true,
      delimiter: '\t',
      relax_column_count: true,
      quote: null,
      trim: true
    });

    if (f === 'z68') {
      d[f] = lines;
    } else {
      lines.forEach(l => {
        let k;
        if (f === 'oo') {
          k = l['adm. systemID'];
        } else if (f === 'z104') {
          k = l.Z104_REC_KEY.substring(2, 9);
        } else if (f === 'z78') {
          k = l.Z78_REC_KEY.substring(2, 9);
        } else if (f === 'z16') {
          k = l.Z16_REC_KEY.substring(2, 9);
        }
        if (!d[f][k]) d[f][k] = [];
        d[f][k].push(l);
      });
    }
  }
  // throw(d.oo);

  const ttl = {
    o: 0,
    p: 0,
    l: 0
  }

  d.z68.forEach(r => {
    let key = r.Z68_REC_KEY.substring(2, 9);
    let oo = d.oo['00' + key];
    console.log(key, oo);
    let id = uuid(key, ns);
    let nt = r.Z68_LIBRARY_NOTE;
    let poNum = r.Z68_ORDER_NUMBER.replace(/^ORDER-/, '');
    let oType = (r.Z68_ORDER_TYPE === 'O') ? 'Ongoing' : 'One-Time';
    let vstr = 'DELBANCO';
    let vid = refData.organizations[vstr];
    let tstr = 'KB Stående order';
    let tid = refData.orderTemplates[tstr];
    let o = {
      id: id,
      poNumber: poNum,
      poNumberPrefix: 'SO',
      orderType: oType,
      vendor: vid,
      template: tid,
      workflowStatus: 'Open',
      tags: { tagList: [ "Aleph" ] }
    };
    if (nt) o.notes = [ nt ];
    if (o.orderType === 'Ongoing') {
      o.ongoing = {
        isSubscription: true,
        manualRenewal: true,
        renewalDate: curYear + '-11-30'
      };
    }
    // console.log(o);
    writeOut(files.p, o);
    ttl.p++;

    let amStr = 'KB: Stående order köp (tryckt material)';
    let amId = refData.acquisitionMethods[amStr];
    let pol = {
      id: uuid(o.id, ns),
      acquisitionMethod: amId,
      collection: true
    };
    console.log(pol);

    o.poLines = []
    writeOut(files.o, o);
    ttl.o++;
  });

  console.log('------------------------');
  console.log('Done!')
  console.log('Composite orders:', ttl.o);
  console.log('Purchase orders', ttl.p);
  console.log('Order lines:', ttl.l);

} catch (e) {
  console.log(e);
}
