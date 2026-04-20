const fs = require('fs');
const uuid = require('uuid/v5');
const path = require('path');
const { parse } = require('csv-parse/sync');
const readline = require('readline');

let refDir = process.argv[2];
const instFile = process.argv[3];
const inFile = process.argv[4];
const filter = process.argv[5];
const ns = 'eab3e237-5dc1-4a4b-b4da-5ab5acc3d0ee';

const files = {
  ord: 'purchase-orders.jsonl',
  open: 'purchase-orders-open.jsonl',
  pol: 'pol-lines.jsonl'
};

const rfiles = {
  organizations: 'organizations.json',
  funds: 'funds.json',
  acquisitionMethods: 'acquisition-methods.json'
};

const nfields = [
  "varField_ft_f",
  "varField_ft_n",
  "varField_ft_n_2",
  "varField_ft_s",
  "varField_ft_v",
  "varField_ft_x",
  "varField_ft_z",
  "varField_ft_z_2",
  "varField_ft_z_3"
]

const otypeMap = {
  "a": "One-Time",
	"n": "One-Time",
	"o": "Ongoing",
	"r": "One-Time",
	"s": "Ongoing",
	"t": "One-Time",
	"v": "One-Time"
};

(async () => {
  try {
    if (!inFile) throw(`Usage: node msmOrders.js <ref_dir> <instances_jsonl> <orders_csv_file> [ <filter_field> ]`);

    const dir = path.dirname(inFile);
    refDir = refDir.replace(/\/$/, '');

    for (let f in files) {
      let fn = dir + '/' + files[f];
      if (fs.existsSync(fn)) {
        fs.unlinkSync(fn);
      }
      files[f] = fn;
    }
    // throw(files);

    const refData = {};
    for (let f in rfiles) {
      let rfile = refDir + '/' + rfiles[f];
      let rdata = require(rfile);
      refData[f] = {};
      rdata[f].forEach(r => {
        let k = r.name || r.value;
        let c = r.code;
        let v = r.id;
        if (k && v) refData[f][k] = v;
        if (c && v) refData[f][c] = v;
      });
    }
    if (process.env.DEBUG === 'ref') throw(refData);

    console.log(`INFO Creating instance map...`);
    let instMap = {};
    let fileStream = fs.createReadStream(instFile);
    let rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });
    let icount = 0;
    for await (let line of rl) {
      icount++;
      let j = JSON.parse(line);
      instMap[j.hrid] = j;
    }
    console.log(`INFO Instances parsed: ${icount}`);

    const writeTo = (fileName, data) => {
      let outStr = JSON.stringify(data) + '\n';
      fs.writeFileSync(fileName, outStr, { flag: 'a' });
    }

    const reqFields = (object, fieldList) => {
      let out = true;
      fieldList.forEach(k => {
        if (out === true && !object[k]) {
          out = false;
          console.log(`ERROR missing required field: "${k}"`);
        }
      
      });
      return out;
    }

    const csv = fs.readFileSync(`${inFile}`, 'utf8');
    const inRecs = parse(csv, {
      columns: true,
      skip_empty_lines: true,
      from: 1
    });
    // throw(inRecs); 

    const seen = {};
    const ttl = { count: 0, orders : 0, ordersOpen: 0, poLines: 0, errors: 0 };
    for (let x = 0; x < inRecs.length; x++) {
      let r = inRecs[x];
      if (filter && !r[filter]) continue;
      ttl.count++;
      if (process.env.DEBUG === 'r') console.log(r);
      let poNum = r.id;
      let ven = r.VENDOR.trim();
      let venId = refData.organizations[ven];
      let otype = r.ORD_TYPE;
      let otypeStr = (otype.match(/^[os]$/)) ? "Ongoing" : "One-Time";
      let copies = r.COPIES;
      let st = r.STATUS;
      let statStr = (st.match(/[1q]/)) ? 'Pending' : (st.match(/[az]/)) ? 'Closed' : 'Open';

      if (seen[poNum]) {
        console.log(`ERROR "${poNum}" already used`);
        ttl.errors++;
        continue;
      }
      if (!poNum.match(/\d/)) {
        console.log(`ERROR "${poNum}" is not a valid poNumber`);
        ttl.errors++;
        continue;
      }
      if (!venId) {
        console.log(`ERROR vendor not found for "${ven}"`)
        ttl.errors++;
        continue;
      }

      let id = uuid(poNum, ns);
      let odate;
      try {
        odate = new Date(r.ODATE).toISOString().substring(0, 10);
      } catch (e) {
        console.log(`WARN "${r.ODATE}" is not a valid date`);
      }
      
      let o = {
        id: id,
        poNumber: poNum,
        vendor: venId,
        orderType: otypeStr,
        workflowStatus: statStr,
        notes: []
      }
      if (odate) o.dateOrdered = odate;
      // o.isSubscription = (r.ORD_TYPE === 's') ? true : false;
      nfields.forEach(f => {
        let n = r[f];
        if (n) o.notes.push(n);
      });
      // if (copies) o.totalItems = parseInt(copies, 10);

      if (process.env.DEBUG === 'o') console.log(o);

      if (o.workflowStatus === 'Open') {
        writeTo(files.open, o);
        o.workflowStatus = 'Pending';
        ttl.ordersOpen++;
      }
      writeTo(files.ord, o); 
      seen[o.poNum] = 1;
      ttl.orders++;
    }

    console.log('Finished!');
    for (let k in ttl) {
      console.log(`${k}: `, ttl[k]);
    }
  } catch (e) {
    console.log(e);
  }
})();
