const parse = require('csv-parse/lib/sync');
const fs = require('fs');
const uuid = require('uuid/v5');
const path = require('path');

let refDir = process.argv[2];
const notesFile = process.argv[3];
const inFile = process.argv[4];
const dbug = process.env.DEBUG;
const ns = 'fa30062f-fc59-47c2-af7b-acd19ce72087';
const unit = 'Wentworth Library';

const files = {
  agree: 'agreements.jsonl',
  supProps: 'custprops.jsonl',
  rel: 'relationships.jsonl',
  notes: 'notes.jsonl'
};

const rfiles = {
  organizations: 'organizations.json',
  acquisitionsUnits: 'units.json',
  roles: 'refdata.json',
  noteTypes: 'note-types.json'
};

const statusMap = {
  'In Progress': 'Active',
  'Completed': 'Active',
  'Saved': 'Active',
  'Archived': 'Nonrenewed'
};

const typeMap = {
  'E-Book Collection': 'ebook_collection', 
  Database: 'database',
  'Streaming Video': 'streaming_video',
  'Departmental Resource': 'internal_resources',
  Journal: 'journals',
  Newspaper: 'online_newspaper',
  Website: 'website'						
}

const supProps = {
  resnote: 'Resource Note',
  resurl: 'Resource URL',
  resalturl: 'Alternate Resource URL',
  prodissn: 'Product ISSN/ISBN',
  authcreds: 'Authentication Username & Password',
  userlimit: 'Simultaneous User Limit',
  format: 'Product Format',
  restype: 'Product Resource Type',
  sites: 'Order Purchasing Sites',
  authtype: 'Access Authentication Type',
  coverage: 'Access Coverage'
}

const scriptName = process.argv[1].replace(/^.+\//, '');

try {
  if (!inFile) throw(`Usage: node.js ${scriptName} <ref_dir> <agreements_csv_file>`);

  const dir = path.dirname(inFile);

  for (let f in files) {
    let fn = dir + '/' + files[f];
    if (fs.existsSync(fn)) {
      fs.unlinkSync(fn);
    }
    files[f] = fn;
  }

  const writeTo = (fileName, data) => {
    let outStr = JSON.stringify(data) + '\n';
    fs.writeFileSync(fileName, outStr, { flag: 'a' });
  }

  refDir = refDir.replace(/\/$/, '');
  const ref = {};
  for (let f in rfiles) {
    let rfile = refDir + '/' + rfiles[f];
    let rdata = require(rfile);
    ref[f] = {};
    if (f === 'roles') {
      rdata.forEach(r => {
        if (r.desc === 'SubscriptionAgreementOrg.Role') {
          r.values.forEach(v => {
            ref[f][v.label] = v.id;
          })
        }
      });
    } else {
      rdata[f].forEach(r => {
        let k = (f === 'organizations') ? r.code : r.name;
        let v = (f === 'organizations') ? {id: r.id, name: r.name} : r.id;
        ref[f][k] = v;
      });
    }
  }
  let unitId = ref.acquisitionsUnits['NECO Library'];

  let csv = fs.readFileSync(notesFile, 'utf8');
  const notes = parse(csv, {
    columns: true,
    skip_empty_lines: true,
    delimiter: '|',
    from: 1
  });

  let nc = 0;
  notes.forEach(n => {
    let id = n['Product ID'];
    let title = n['Resource Note Tab Name'];
    let note = n['Resource Note'];
    let type = n['Resource Note Type'];
    let nkey = id + note + type;
    let nobj = {
      id: uuid(nkey, ns),
      title: title,
      content: note,
      domain: 'organizations',
      typeId: ref.noteTypes[type],
      links: [ {
        id: uuid(id, ns),
        type: 'organization'
      } ]
    } 
    writeTo(files.notes, nobj)
    nc++;
  });

  csv = fs.readFileSync(`${inFile}`, 'utf8');
  const inRecs = parse(csv, {
    columns: true,
    skip_empty_lines: true,
    delimiter: '|',
    bom: true,
    escape: '\\'
  });

  const seen = {};
  const ag = {};
  inRecs.forEach(r => {
    for (let f in r) {
      r[f] = r[f].replace(/\\N/g, '');
    }
    let oid = r['Product ID'];
    let org = r['Order Organization'];
    let role = r['Order Organization Role'];
    let alt = r['Product Alias'];
    let altType = r['Product Alias Type'];
    let start = r['Order Sub Start'];
    let end = r['Order Current Sub End'];
    org += '|' + role;
    if (altType) alt = `${alt} (${altType})`;
    if (!ag[oid]) { 
      ag[oid] = r;
      ag[oid].xorgs = [];
      ag[oid].xalt = [];
    }
    if (org && ag[oid].xorgs.indexOf(org) === -1) ag[oid].xorgs.push(org);
    if (alt && ag[oid].xalt.indexOf(alt) === -1) ag[oid].xalt.push(alt);
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
    let type = a['Product Resource Type'];
    let status = a['Product Status'];
    let start = a['Order Sub Start'];
    let end = a['Order Current Sub End'];

    // map custom props below
    let resurl = a['Product URL'];
    let resalturl = a['Product Alt URL'];
    let prodissn = a['Product ISSN/ISBN'];
    let format = a['Product Format'];
    let restype = a['Product Resource Type'];
    let sites = a['Order Purchasing Sites'];
    let authtype = a['Access Authentication Type'];
    let coverage = a['Access Coverage'];
    let creds = [];
    let creda = a['Access Username'];
    let credb = a['Access Password'];
    if (creda) creds.push(creda);
    if (credb) creds.push(credb);
    let userlimit = a['Access Simultaneous User Limit'];

    if (resurl) cprops.resurl[0].value = resurl;
    if (resalturl) cprops.resalturl[0].value = resalturl;
    if (prodissn) cprops.prodissn[0].value = prodissn;
    if (format) cprops.format[0].value = format;
    if (restype) cprops.restype[0].value = restype;
    if (sites) cprops.sites[0].value = sites;
    if (authtype) cprops.authtype[0].value = authtype;
    if (coverage) cprops.coverage[0].value = coverage;
    if (creds[0]) cprops.authcreds[0].value = creds.join('/');
    if (userlimit) cprops.userlimit[0].value = userlimit;

    let oid = a['Product ID'];
    let relId = a['Product Related Products ID'] || '';
    let relType = a['Product Related Products Relationship Type'] ||'';

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
      orgs: [],
      alternateNames: []
    };
    a.xorgs.forEach((o, i) => {
      let [ orgId, role ] = o.split(/\|/);
      let roleId = ref.roles[role] || '2c90be3d87d1d07a01888c39bd830053';
      let org = {
        _delete: false,
        roles: [{ role: {id: roleId} }],
        primaryOrg: false
      };
      orgMap = ref.organizations[orgId];
      if (orgMap) {
        org.org = { orgsUuid: orgMap.id, name: orgMap.name };
      }
      if (i === 0) org.primaryOrg = true
      // agr.orgs.push(org);
    });

    agr.agreementStatus = statusMap[status];
    if (desc) agr.description = desc;

    if (type) {
      agr.agreementContentTypes = [ 
        { 
          _delete: false,
          contentType: { value: typeMap[type] }
        }
      ];
    }

    a.xalt.forEach(t => {
      agr.alternateNames.push({ name: t });
    });

    if (start) {
      if (start === '0000-00-00') start = '2000-01-01';
      let per = {};
      per.startDate = start;
      if (end && end !== '0000-00-00') per.endDate = end;
      agr.periods= [ per ];
    }
    if (dbug) console.log(JSON.stringify(agr, null, 2)); 
    writeTo(files.agree, agr);
    c++;

    if (relId && oid) {
      let rel = {
        id: oid,
        rid: relId,
        type: relType
      };
      writeTo(files.rel, rel);
    }

    if (dbug) if (c === 5) break;
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
