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
let ordDir = process.argv[5];
let z103file = process.argv[3];
let instFile = process.argv[4];

const files = {
  o: 'composite-orders',
  p: 'purchase-orders',
  l: 'po-lines'
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

(async () => {
  try {
    if (!ordDir) throw 'Usage: node nlsOrders.js <ref_dir> <z103_table> <instances_file> <orders_dir>';
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
    // throw(d.z68);

    adminMap = {};
    d.z68.forEach(r => {
      let k = r.Z68_REC_KEY.substring(0, 9);
      adminMap[k] = 1;
    });
    // throw(adminMap);

    // map link files;
    console.log(`INFO Reading linker data from ${z103file}`);
    const linkMap = {};
    const linkMapRev = {};
    let fileStream = fs.createReadStream(z103file);
    let rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });
    let lc = 0;
    let mc = 0;
    for await (let line of rl) {
      lc++;
      let c = line.split(/\t/);
      let k = c[0].substring(5, 14);
      let t = c[2];
      let bid = c[3];
      if (t === 'KBS01' && adminMap[k]) {
        linkMap[k] = bid;
        linkMapRev[bid] = k;
        mc++;
      }
      if (lc % 1000000 === 0) {
        console.log('Linker lines read:', lc, `(${mc})`);
      }
    }
    console.log('Linker lines read:', lc, `(${mc})`);
    console.log('Links mapped:', mc);
    // throw(linkMap);
    // throw(linkMapRev);

    // create instance map
    console.log(`INFO Reading instance data from ${instFile}`);
    const instMap = {};
    fileStream = fs.createReadStream(instFile);
    rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });
    lc = 0;
    mc = 0;
    for await (let line of rl) {
      lc++
      let m = line.match(/"hrid":"(\d+)"/);
      if (linkMapRev[m[1]]) {
        let inst = JSON.parse(line);
        instMap[inst.hrid] = inst;
      }
      if (lc % 100000 === 0) console.log('Instance lines read:', lc);
    }
    console.log('Instance lines read:', lc);
    // throw(instMap);

    const ttl = {
      o: 0,
      p: 0,
      l: 0
    }

    d.z68.forEach(r => {
      let key = r.Z68_REC_KEY.substring(2, 9);
      let akey = r.Z68_REC_KEY.substring(0, 9);
      let instId = linkMap[akey];
      let inst = instMap[instId];
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
        purchaseOrderId: o.id,
        acquisitionMethod: amId,
        source: 'User',
        collection: true,
        tags: { tagList: [ "Aleph" ] },
      };
      pol.cost = {
        currency: 'SEK'
      }
      pol.physical = {
        createInventory: 'None',
        materialType: refData.mtypes._unspecified || refData.mtypes.unspecified || refData.mtypes.Monografi
      }
      if (inst) {
        pol.instanceId = inst.id;
        pol.titleOrPackage = inst.title;
        if (inst.contributors) {
          inst.contributors.forEach(c => {
            delete c.contributorTypeId;
            delete c.primary;
            c.contributor = c.name;
            delete c.name;
          });
          pol.contributors = inst.contributors;
        }
        if (inst.publication && inst.publication[0]) {
          if (inst.publication[0].dateOfPublication) pol.publicationDate = inst.publication[0].dateOfPublication;
          if (inst.publication[0].publisher) pol.publisher = inst.publication[0].publisher;
        }
      }
      pol.orderFormat = 'Physical Resource';
      // console.log(pol);
      writeOut(files.l, pol);
      ttl.l++;

      o.poLines = [ pol ]
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
})();
