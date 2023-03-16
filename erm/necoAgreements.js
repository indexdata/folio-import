const parse = require('csv-parse/lib/sync');
const fs = require('fs');
const uuid = require('uuid/v5');
const path = require('path');

const refDir = process.argv[2];
const inFile = process.argv[3];
const ns = '2d0d02e9-5758-4d3b-8db7-fafa64cfd03e';
const unit = 'NECO Library';

const files = {
  agree: 'agreements.jsonl',
  supProps: 'custprops.jsonl'
};

const rfiles = {
  organizations: 'organizations.json',
  acquisitionsUnits: 'units.json'
};

const statusMap = {
  'In Progress': 'active',
  'Completed': 'active',
  'Archived': 'closed'
};

const supProps = {
  resnote: 'Resource Note',
  resurl: 'Resource URL',
  resalturl: 'Alternate Resource URL',
  prodissn: 'Product ISSN/ISBN',
  authcreds: 'Authentication Username & Password',
  userlimit: 'Simultaneous User Limit'
}

try {
  if (!inFile) throw(`Usage: node.js necoAgreements <ref_dir> <agreements_csv_file>`);

  const dir = path.dirname(inFile);

  for (let f in files) {
    let fn = dir + '/' + files[f];
    if (fs.existsSync(fn)) {
      fs.unlinkSync(fn);
    }
    files[f] = fn;
  }

  const csv = fs.readFileSync(`${inFile}`, 'utf8');
  const inRecs = parse(csv, {
    columns: true,
    skip_empty_lines: true,
    delimiter: '|',
    bom: true,
    escape: '\\'
  });

  const ref = {};
  for (let f in rfiles) {
    let rfile = refDir + rfiles[f];
    let rdata = require(rfile);
    ref[f] = {};
    rdata[f].forEach(r => {
      let k = r.name || r.value;
      let v = r.id;
      ref[f][k] = v;
    });
  }
  // console.log(ref); return;
  let unitId = ref.acquisitionsUnits['NECO Library'];

  const writeTo = (fileName, data) => {
    let outStr = JSON.stringify(data) + '\n';
    fs.writeFileSync(fileName, outStr, { flag: 'a' });
  }

  const seen = {};
  const ag = {};
  inRecs.forEach(r => {
    for (let f in r) {
      r[f] = r[f].replace(/\\N/g, '');
    }
    let oid = r['Product ID'];
    let pnote = r['Product Notes'];
    let org = r['Product Organization ID'];
    if (!ag[oid]) { 
      ag[oid] = r;
      ag[oid].xnotes = [];
      ag[oid].xorgs = [];
    }
    if (pnote && ag[oid].xnotes.indexOf(pnote) === -1) ag[oid].xnotes.push(pnote);
    if (org && ag[oid].xorgs.indexOf(org) === -1) ag[oid].xorgs.push(org);
  });

  let c = 0;
  for (let al in ag) {
    let a = ag[al];
    let name = a['Product Name'];
    let desc = a['Product Description'];
    let status = a['Product Status'];
    let start = a['Order Sub Start'];
    let end = a['Order Current Sub End'];
    let agr = {
      id: uuid(al, ns),
      name: name,
      customProperties: {}
    };
    for (let p in supProps) {
      agr.customProperties[p] = [{ _delete: true }];
    }
    agr.agreementStatus = statusMap[status];
    if (desc) agr.description = desc;
    if (start) {
      if (start === '0000-00-00') start = '2000-01-01';
      let per = {};
      per.startDate = start;
      if (end && end !== '0000-00-00') per.endDate = end;
      agr.periods= [ per ];
    }
    writeTo(files.agree, agr);
    console.log(agr);
    c++;
    if (c === 5) break;
  }

  let cpc = 0;
  for (let p in supProps) {
    let cust = {
      weight: 0,
      primary: true,
      retired: false,
      defulatInternal: true,
      type: 'Text',
      label: supProps[p],
      name: p,
      description: supProps[p],
      ctx: ''
    };
    writeTo(files.supProps, cust);
    cpc++;
  }

  console.log('Finished!');
  console.log('Agreements:', c);
  console.log('Custom Properties', cpc);
} catch (e) {
  console.log(e);
}
