const parse = require('csv-parse/lib/sync');
const fs = require('fs');
const uuid = require('uuid/v5');
const path = require('path');
const readline = require('readline');

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

const mfiles = {
  map: 'licensesMap.jsonl',
  out: 'licensesOut.jsonl'
}

const statusMap = {
  'In Progress': 'Active',
  'Completed': 'closed',
  'Saved': 'Draft',
  'Archived': 'closed'
};

const supProps = {
  authenticationType: "Authentication Type",
  AuthorIdentification: "Author Identification",
  resourceURL: "Resource URL",
  'Eligible authors': 'Eligible authors',
  SupportPublishing: 'SupportPublishing',
  entitlementDates: 'Entitlement Dates',
  isbnOrIssn: 'ISBN or ISSN',
  purchaseSite: 'Purchase Site',
  simulUsers: 'Simultaneous Users',
  systemNumber: 'System Number'
};

periodNotes = [
  'Order Acquisition Type',
  'Order Number',
  'Order Type',
  'Invoice Number',
  'Fund',
  'Payment Amount',
  'Year',
  'Cost Note',
  'Cost Details'
];

const scriptName = process.argv[1].replace(/^.+\//, '');

(async() => {
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
  ref.contentTypes = {};
  for (let f in rfiles) {
    let rfile = refDir + '/' + rfiles[f];
    let rdata = require(rfile);
    ref[f] = {};
    if (f === 'roles') {
      rdata.forEach(r => {
        let k = 'roles';
        if (r.desc === 'SubscriptionAgreementOrg.Role' || r.desc === 'SubscriptionAgreement.ContentType') {
          if (r.desc === 'SubscriptionAgreement.ContentType') {
              k = 'contentTypes';
          }
          r.values.forEach(v => {
            if (k === 'contentTypes') {
              ref[k][v.label] = v.value;
            } else {
              ref[k][v.label] = v.id;
            }
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
  // console.log(ref); return;


  let fileStream = fs.createReadStream(dir + '/' + mfiles.out);
  let rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  const outMap = {};
  for await (const line of rl) {
    let j = JSON.parse(line);
    outMap[j.name] = j.id;
  }
  // console.log(outMap); return;

  fileStream = fs.createReadStream(dir + '/' + mfiles.map);
  rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  const licMap = {};
  for await (const line of rl) {
    let j = JSON.parse(line);
    licMap[j.id] = outMap[j.name];
  }
  // console.log(licMap);

  let csv = fs.readFileSync(`${inFile}`, 'utf8');
  const inRecs = parse(csv, {
    columns: true,
    skip_empty_lines: true,
    relax_quotes: true,
    delimiter: '|',
    bom: true,
    escape: '\\'
  });

  let today = new Date().toISOString().substring(0, 10);
  const seen = {};
  const ag = {};
  inRecs.forEach(r => {
    // console.log(r);
    for (let f in r) {
      r[f] = r[f].replace(/\\N/g, '');
    }
    let oid = r['Product ID'];
    let org = r['Product Organization'];
    let role = r['Product Organization Role'];
    let alt = r['Product Alias'];
    let altType = r['Product Alias Type'];
    let lic = r['License ID'];
    let ostart = r['Payment Sub Start'];
    ostart = ostart.replace(/0000-00-00/, '2000-01-01');
    let start = (ostart) ? new Date(ostart).toISOString() : '';
    start = start.substring(0, 10);
    let oend = (ostart === '2000-01-01') ? '2000-01-02' : r['Payment Sub End'].replace(/0000-00-00/, ostart);
    let end = '';
    try { end = (oend) ? new Date(oend).toISOString() : ''; } catch {}
    end = end.substring(0,10);
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
      // per += '|' + pnoteStr;
    }
    if (!ag[oid]) { 
      ag[oid] = r;
      ag[oid].xorgs = {};
      ag[oid].xper = {};
      ag[oid].xalt = [];
      ag[oid].xlic = [];
    }
    if (!ag[oid].xorgs[org]) ag[oid].xorgs[org] = [];
    if (!ag[oid].xper[per]) ag[oid].xper[per] = pnoteStr;
    if (role && ag[oid].xorgs[org].indexOf(role) === -1) ag[oid].xorgs[org].push(role);
    if (alt && ag[oid].xalt.indexOf(alt) === -1) ag[oid].xalt.push(alt);
    if (lic && ag[oid].xlic.indexOf(lic) === -1) ag[oid].xlic.push(lic);
  });
  // console.log(JSON.stringify(ag, null, 2)); return;

  csv = fs.readFileSync(notesFile, 'utf8');
  const notes = parse(csv, {
    columns: true,
    skip_empty_lines: true,
    delimiter: '|',
    trim: true,
    from: 1,
    escape: '\\'
  });

  let nc = 0;
  notes.forEach(n => {
    let id = n['Product ID'];
    if (ag[id]) {
      let agrName = ag[id]['Product Name'];
      let title = n['Resource Note Tab Name'];
      let note = n['Resource Note'];
      let type = n['Resource Note Type'];
      let nkey = id + note + type;
      let nobj = {
        id: uuid(nkey, ns),
        title: title,
        content: `<p>${note}</p>`,
        domain: 'agreements',
        typeId: ref.noteTypes[type],
        links: [ {
          id: agrName,
          type: 'agreement'
        } ]
      } 
      writeTo(files.notes, nobj)
      nc++;
    }
  });


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

    // map custom props below
    let ru = [];
    let ed = [];
    let authenticationType = a['Access Authentication Type'];
    let AuthorIdentification = a['Author Identification'];
    if (a['Resource URL']) ru.push(a['Resource URL']);
    if (a['Resource Alt URL']) ru.push(a['Resource Alt URL']);
    let resourceURL = (ru[0]) ? ru.join(', ') : '';
    let simulUsers = a['Access Simultaneous User Limit'];
    let isbnOrIssn = a['ISBN'];
    let purchaseSite = a['Purchase Site'];
    let systemNumber = a['System Number'];
    if (a['Order Sub Start']) ed.push(a['Order Sub Start']);
    if (a['Order Current Sub End']) ed.push(a['Order Current Sub End']);
    let entitlementDates = (ed[0]) ? ed.join(', ') : '';

    if (authenticationType) cprops.authenticationType[0].value = authenticationType.toLowerCase().replace(/\W/g, '_');
    if (AuthorIdentification) cprops.AuthorIdentification[0].value = AuthorIdentification.toLowerCase().replace(/\W/g, '_');
    if (simulUsers) cprops.simulUsers[0].value = simulUsers;
    if (isbnOrIssn) cprops.isbnOrIssn[0].value = isbnOrIssn;
    if (purchaseSite) cprops.purchaseSite[0].value = purchaseSite.toLowerCase().replace(/\W/g, '_');
    if (resourceURL) cprops.resourceURL[0].value = resourceURL;
    if (systemNumber) cprops.systemNumber[0].value = systemNumber;
    if (entitlementDates) cprops.entitlementDates[0].value = entitlementDates;

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
    // cprops = {};
    let agr = {
      id: uuid(al, ns),
      name: name,
      customProperties: cprops,
      orgs: [],
      alternateNames: [],
      periods: []
    };

    let i = 0;
    for (let orgId in a.xorgs) {
      let roles = [];
      a.xorgs[orgId].forEach(role => {
        let roleId = ref.roles[role] || '2c902d378d19822a018e51fc7f41005c';
        robj = {
          role: { id: roleId }
        };
        roles.push(robj);
      });
      let org = {
        _delete: false,
        roles: roles,
        primaryOrg: false
      };
      orgMap = ref.organizations[orgId];
      if (orgMap) {
        org.org = { orgsUuid: orgMap.id, name: orgMap.name };
      }
      if (i === 0) org.primaryOrg = true
      agr.orgs.push(org);
      i++;
    };

    agr.agreementStatus = statusMap[status];
    if (desc) agr.description = desc;

    if (type) {
      type = type.replace(/Ebook/, 'E-Book');
      agr.agreementContentTypes = [ 
        { 
          _delete: false,
          contentType: { value: ref.contentTypes[type] }
        }
      ];
    }

    a.xalt.forEach(t => {
      agr.alternateNames.push({ name: t });
    });

    for (let p in a.xper) {
      let n = a.xper[p];
      let [s, e] = p.split(/\|/);
      let ps = (e < today) ? 'previous' : 'current';
      let o = {
        startDate: s,
        endDate: e,
        periodStatus: ps,
        note: n
      };
      agr.periods.push(o);
    };

    a.xlic.forEach(l => {
      let rid = licMap[l];
      if (rid) {
        if (!agr.linkedLicenses) agr.linkedLicenses = [];
        let o = {
          _delete: false,
          status: 'historical',
          remoteId: rid,
        }
        agr.linkedLicenses.push(o);
      }
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
  console.log('Custom Props:', cpc);
  console.log('Notes:', nc);
  if (nc > 0) console.log('*** Make sure to run makeErmNotes.js after loading agreements! ***');
} catch (e) {
  console.log(e);
}
})();
