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
};

const supProps = {
  accessMethod: "Access Method",
  authType: "Authentication Type",
  AuthorIdentification: "Author Identification",
  authSite: "Authorized Site",
  provider: "Resource Provider",
  resourceURL: "Resource URL",
  simulUsers: "Simultaneous Users",
  'Eligible authors': 'Eligible authors',
  SupportPublishing: 'SupportPublishing'
};

periodNotes = [
  'Order Acquisition Type',
  'Order Number',
  'Fund',
  'Payment',
  'Cost Note'
];

const scriptName = process.argv[1].replace(/^.+\//, '');

try {
  if (!inFile) throw(`Usage: node.js ${scriptName} <ref_dir> <notes_csv_file> <agreements_csv_file>`);

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

  let today = new Date().toISOString().substring(0, 10);
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
    let ostart = r['Order Sub Start'];
    let start = (ostart) ? new Date(ostart).toISOString() : '';
    start = start.substring(0, 10);
    let oend = r['Order Current Sub End'];
    let end = (oend) ? new Date(oend).toISOString() : '';
    end = end.substring(0,10);
    org += '|' + role;
    if (altType) alt = `${alt} (${altType})`;
    let per = (start) ? `${start}|${end}` : '';
    let pnotes = [];
    periodNotes.forEach(h => {
      let txt = r[h];
      if (txt) {
        pnotes.push(`${h}: ${txt}`);
      }
    });
    let pnoteStr = pnotes.join('; ');
    if (per && pnoteStr) {
      per += '|' + pnoteStr;
    }
    if (!ag[oid]) { 
      ag[oid] = r;
      ag[oid].xorgs = [];
      ag[oid].xalt = [];
      ag[oid].xper = [];
    }
    if (org && ag[oid].xorgs.indexOf(org) === -1) ag[oid].xorgs.push(org);
    if (alt && ag[oid].xalt.indexOf(alt) === -1) ag[oid].xalt.push(alt);
    if (per && ag[oid].xper.indexOf(per) === -1) ag[oid].xper.push(per);
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
    let accessMethod = a['Access Method'];
    let authType = a['Access Authentication Type'];
    let AuthorIdentification = a['Author Identification'];
    let authSite = a['Access Authorized Sites'];
    let provider = a['Resource Provider'];
    let resourceUrl = a['Resource URL'];
    let simulUsers = a['Access Simultaneous User Limit'];

    if (accessMethod) cprops.accessMethod[0].value = accessMethod.toLowerCase().replace(/\W/g, '_');
    if (authType) cprops.authType[0].value = authType.toLowerCase().replace(/\W/g, '_');
    if (AuthorIdentification) cprops.AuthorIdentification[0].value = AuthorIdentification.toLowerCase().replace(/\W/g, '_');
    if (authSite) cprops.authSite[0].value = authSite.toLowerCase().replace(/\W/g, '_');
    if (provider) cprops.provider[0].value = provider;
    if (resourceUrl) cprops.resourceUrl[0].value = resourceUrl;
    if (simulUsers) cprops.simulUsers[0].value = simulUsers;

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
    cprops = {};
    let agr = {
      id: uuid(al, ns),
      name: name,
      customProperties: cprops,
      orgs: [],
      alternateNames: [],
      periods: []
    };
    a.xorgs.forEach((o, i) => {
      let [ orgId, role ] = o.split(/\|/);
      let roleId = ref.roles[role] || '2c90b5068b6d6a83018b71272116011c';
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
      agr.orgs.push(org);
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

    a.xper.forEach(p => {
      let [s, e, n] = p.split(/\|/);
      let ps = (e < today) ? 'previous' : null;
      let o = {
        startDate: s,
        endDate: e,
        periodStatus: ps,
        note: n
      };
      agr.periods.push(o);
    });

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
