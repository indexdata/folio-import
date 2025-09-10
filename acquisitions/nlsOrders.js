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
  c: 'purchase-orders-pending',
  l: 'po-lines',
  n: 'pol-notes'
};

const zfiles = {
  oo: 'open-orders.csv',
  z68: 'z68.dsv',
  z16: 'z16.dsv',
  z104: 'z104.dsv',
  z78: 'z78.dsv'
};

const cost = {
  currency: 'SEK',
  quantityPhysical: 0,
  listUnitPrice: 0,
  discountType: 'percentage',
  discount: 0,
  poLineEstimatedPrice: 0
};

let newDate = new Date();
let start = newDate.valueOf();
const curYear = newDate.getFullYear();

const writeOut = (fileName, data) => {
  let line = JSON.stringify(data) + "\n";
  fs.writeFileSync(fileName, line, { flag: 'a' });
}

const makePolNote = (content, date, type, poLineId, refData) => {
  let txt = content;
  date = (date) ? date.replace(/(....)(..)(..)/, '$1-$2-$3') : '';
  let id = uuid(poLineId + date + txt, ns);
  let typeStr = type;
  let typeId = refData.noteTypes[typeStr];
  if (!typeId) throw new Error(`ERROR noteTypeId not found for "${typeStr}"!`);
  let o = {
    id: id,
    title: 'Note',
    content: `<p>${txt}</p><p>Date: ${date}</p>`,
    typeId: typeId,
    domain: 'orders',
    links: [{
      id: poLineId,
      type: 'poLine'
    }]
  };
  return o;
}

const parseInst = (pol, inst, refData) => {
  pol.instanceId = inst.id;
  pol.titleOrPackage = inst.title;
  if (inst.contributors) {
    inst.contributors.forEach(c => {
      delete c.contributorTypeId;
      delete c.primary;
      if (c.name) c.contributor = c.name;
      delete c.name;
    });
    pol.contributors = inst.contributors;
  }
  if (inst.publication && inst.publication[0]) {
    if (inst.publication[0].dateOfPublication) pol.publicationDate = inst.publication[0].dateOfPublication;
    if (inst.publication[0].publisher) pol.publisher = inst.publication[0].publisher;
  }
  let pns = inst.identifiers;
  if (pns) {
    pol.details.productIds = [];
    pns.forEach(p => {
      let itype = p.identifierTypeId;
      if (refData.productIdentifiers[itype]) {
        let o = {
          productId: p.value,
          productIdType: p.identifierTypeId
        }
        pol.details.productIds.push(o);
      }
    });
  }
}

(async () => {
  try {
    if (!ordDir) throw 'Usage: node nlsOrders.js <ref_dir> <z103_table> <instances_file> <orders_dir>';
    refDir = refDir.replace(/\/$/, '');
    ordDir = ordDir.replace(/\/$/, '');
    console.log(`Start: ${newDate}`);

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
        if (prop === 'identifierTypes') refData.productIdentifiers = {};
        j[prop].forEach(d => {
          let n = d.name || d.templateName || d.value;
          let c = d.code || d.templateCode;
          if (prop === 'identifierTypes') {
            if (!d.name.match(/control|OCLC|LCCN|local|libris|LIBR|katalog/i)) refData.productIdentifiers[d.id] = d.name;
          }
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
        let dx = {}
        lines.forEach(l => {
          if (f === 'z16') {
            let id = l.Z16_REC_KEY;
            let k = id.substring(0, 13);
            let o = id.substring(13, 17);
            if (!dx[k] || o > dx[k]) {
              if (!d[f][k]) d[f][k] = {};
              l.Z16_SEQ = o;
              d[f][k] = l;
              dx[k] = o;
            }
          } else if (f === 'oo') {
              k = l['adm. systemID']; 
              d[f][k] = l;
          } else {
            let k;
            if (f === 'z104') {
              k = l.Z104_REC_KEY.substring(0, 9);
            } else if (f === 'z78') {
              k = l.Z78_REC_KEY.substring(2, 9);
            } 
            if (!d[f][k]) d[f][k] = [];
            d[f][k].push(l);
          }
        });
      }
    }
    // throw(d.z16);

    adminMap = {};
    d.z68.forEach(r => {
      let k = r.Z68_REC_KEY.substring(0, 9);
      adminMap[k] = 1;
    });
    for (let k in d.z16) {
      let ak = d.z16[k].Z16_REC_KEY.substring(0, 9);
      adminMap[ak] = 1;
    };
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
      let m = line.match(/"hrid":"(\w+)"/);
      if (m && linkMapRev[m[1]]) {
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
      l: 0,
      n: 0
    }

    d.z68.forEach(r => {
      let key = r.Z68_REC_KEY.substring(2, 9);
      let akey = r.Z68_REC_KEY.substring(0, 9);
      let instId = linkMap[akey];
      let inst = instMap[instId];
      let id = uuid(key, ns);
      let nt = r.Z68_LIBRARY_NOTE;
      let poNum = r.Z68_ORDER_NUMBER.replace(/^ORDER-/, 'SO');
      let oType = (r.Z68_ORDER_TYPE === 'O') ? 'Ongoing' : 'One-Time';
      let vstr = 'DELBANCO';
      let vid = refData.organizations[vstr];
      let tstr = 'KB Stående order';
      let tid = refData.orderTemplates[tstr];
      let odate = r.Z68_OPEN_DATE.replace(/^(....)(..)(..)/, '$1-$2-$3');
      let o = {
        id: id,
        poNumber: poNum,
        poNumberPrefix: 'SO',
        orderType: oType,
        vendor: vid,
        template: tid,
        workflowStatus: 'Open',
        dateOrdered: odate,
        tags: { tagList: [ "Aleph" ] }
      };
      if (nt) o.notes = [ nt ];
      if (o.orderType === 'Ongoing') {
        o.ongoing = {
          isSubscription: true,
          manualRenewal: true,
          renewalDate: curYear + '-11-30',
          reviewPeriod: 90
        };
      }
      // console.log(o);
      writeOut(files.p, o);
      o.workflowStatus = 'Pending';
      writeOut(files.c, o);
      o.workflowStatus = 'Open';
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
        cost: cost,
        poLineNumber: o.poNumber + '-1'
      };

      pol.physical = {
        createInventory: 'None',
        materialType: refData.mtypes['Häfte/Volym Standing order'] || refData.mtypes.unspecified || refData.mtypes._unspecified,
        volumes: []
      };

      if (inst) {
        pol.details = {};
        parseInst(pol, inst, refData);
      }

      pol.orderFormat = 'Physical Resource';
      // console.log(pol);
      writeOut(files.l, pol);
      ttl.l++;

      o.poLines = [ pol ]
      writeOut(files.o, o);
      ttl.o++;
      
      let z78 = d.z78[key];
      if (z78) {
        z78.forEach(n => {
          let o = makePolNote(n.Z78_ARRIVAL_NOTE, n.Z78_ARRIVAL_DATE, 'Mottagning', pol.id, refData);
          writeOut(files.n, o);
          ttl.n++
        });
      }

      
    });

    for (let k in d.z16) {
      let akey = k.substring(0, 9);
      let r = d.z16[k];
      let odate = r.Z16_COPY_FROM_DATE.replace(/^(....)(..)(..)/, '$1-$2-$3');
      let cnote = r.Z16_CHECK_IN_NOTE;
      let tstr = 'KB prenumeration';
      let tid = refData.orderTemplates[tstr];
      let vstr = 'SREBSCO';
      let vid = refData.organizations[vstr];
      // console.log(r);
      let id = uuid(k + 'sub', ns);
      let oo = d.oo[akey];
      let wfs = (oo) ? 'Open' : 'Closed';
      let vrf = oo['POL Vendor reference number'];
      let puNum;
      if (vrf) {
        puNum = vrf;
      } else {
        puNum = 'SU' + k.replace(/^00/, '');
        puNum = puNum.replace(/0000(.)$/, '$1');
      }
      let instId = linkMap[akey];
      let inst = instMap[instId];

      let o = {
        id: id,
        dateOrdered: odate,
        manualPo: true,
        poNumber: puNum,
        orderType: 'Ongoing',
        reEncumber: true,
        template: tid,
        vendor: vid,
        workflowStatus: wfs,
        tags: { tagList: [ "Aleph" ] }
      }
      if (cnote) o.notes = [ cnote ];
      if (o.orderType === 'Ongoing') {
        o.ongoing = {
          isSubscription: true,
          manualRenewal: true,
          renewalDate: curYear + '-11-30',
          reviewPeriod: 90
        };
      }
      // console.log(o);
      writeOut(files.p, o);
      o.workflowStatus = 'Pending';
      writeOut(files.c, o);
      o.workflowStatus = 'Open';
      ttl.p++;

      let amStr = 'KB: Inköp av utländsk tidskrift (prenumerationer, inkl. e-resurs)';
      let am = refData.acquisitionMethods[amStr];
      if (!am) throw new Error(`AquisitionMethodId not found for "${amStr}"`);

      let pol = {
        id: uuid(o.id, ns),
        purchaseOrderId: o.id,
        acquisitionMethod: am,
        orderFormat: 'Physical Resource',
        source: 'User',
        cost: cost,
        poLineNumber: o.poNumber + '-1'
      }

      if (inst) {
        pol.details = {};
        parseInst(pol, inst, refData);
      }

      if (oo) {
        let fmt = oo.Format;
        if (fmt === 'Online') pol.orderFormat = 'Electronic Resource';
        if (vrf) pol.vendorDetail = {
          referenceNumbers: [
            {
              refNumber: vrf,
              refNumberType: 'Vendor order reference number',
              vendorDetailsSource: 'OrderLine'
            }
          ]
        };
      }

      if (pol.orderFormat === 'Physical Resource') {
        pol.physical = {
          createInventory: 'None',
          materialType: refData.mtypes['Häfte/Volym Standing order'] || refData.mtypes.unspecified || refData.mtypes._unspecified,
          volumes: []
        };
      }

      let z104 = d.z104[akey];
      if (z104) {
        z104.forEach(n => {
          let o = makePolNote(n.Z104_TEXT, n.Z104_TRIGGER_DATE, 'Förvärvsanteckning', pol.id, refData);
          writeOut(files.n, o);
          ttl.n++
        });
      }
      
      writeOut(files.l, pol);
      ttl.l++;

      o.poLines = [ pol ];
      writeOut(files.o, o);
      ttl.o++;
    }

    newDate = new Date();
    let end = newDate.valueOf();
    let tt = (end - start)/1000;
    console.log('------------------------');
    console.log(`Done: ${newDate}`)
    console.log('Composite orders:', ttl.o);
    console.log('Purchase orders', ttl.p);
    console.log('Order lines:', ttl.l);
    console.log('POL notes:', ttl.n);
    console.log('Total time (secs):', tt);
  } catch (e) {
    console.log(e);
  }
})();
