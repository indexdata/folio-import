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
      let k = (f === 'organizations') ? r.code : r.name;
      let v = (f === 'organizations') ? {id: r.id, name: r.name} : r.id;
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
    let ntype = r['Product Note Type'];
    let org = r['Product Organization ID'];
    if (!ag[oid]) { 
      ag[oid] = r;
      ag[oid].xnotes = [];
      ag[oid].xorgs = [];
    }
    if (pnote) {
      let compNote = ntype + ': ' + pnote;
      if (ag[oid].xnotes.indexOf(compNote) === -1) ag[oid].xnotes.push(compNote);
    }
    if (org && ag[oid].xorgs.indexOf(org) === -1) ag[oid].xorgs.push(org);
  });
  // console.log(ag); return;

  let c = 0;
  for (let al in ag) {
    let a = ag[al];
    let cprops = {};
    for (let p in supProps) {
      cprops[p] =[{ _delete: true }];
    }
    let name = a['Product Name'];
    let desc = a['Product Description'];
    let status = a['Product Status'];
    let start = a['Order Sub Start'];
    let end = a['Order Current Sub End'];

    // map custom props below
    let resurl = a['Product URL'];
    let resalturl = a['Product Alt URL'];
    let prodissn = a['Product ISSN/ISBN'];
    let creds = [];
    let creda = a['Access Username'];
    let credb = a['Access Password'];
    if (creda) creds.push(creda);
    if (credb) creds.push(credb);
    let userlimit = a['Access Simultaneous User Limit'];

    if (resurl) cprops.resurl[0].value = resurl;
    if (resalturl) cprops.resalturl[0].value = resalturl;
    if (prodissn) cprops.prodissn[0].value = prodissn;
    if (creds[0]) cprops.authcreds[0].value = creds.join('/');
    if (userlimit) cprops.userlimit[0].value = userlimit;
    a.xnotes.forEach((n, i) => {
      if (i === 0) {
        cprops.resnote[0].value = n;
      } else {
        cprops.resnote[0].value += '; ' + n;
      }
      
    });

    for (let p in cprops) {
      cprops[p].forEach(o => {
        if (o.value) {
          o._delete = false;
        }
      });
    }

    let agr = {
      id: uuid(al, ns),
      name: name,
      customProperties: cprops,
      orgs: []
    };
    a.xorgs.forEach((o, i) => {
      let org = {
        _delete: false,
        roles: [{ role: {id: '2c90a37d843a686001847c28f9920016'} }],
        primaryOrg: false
      };
      orgMap = ref.organizations[o];
      if (orgMap) {
        org.org = { orgsUuid: orgMap.id, name: orgMap.name };
      }
      if (i === 0) org.primaryOrg = true
      agr.orgs.push(org);
    });

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
    c++;
    // if (c === 5) break;
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