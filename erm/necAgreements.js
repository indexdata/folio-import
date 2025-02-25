const { parse } = require('csv-parse/sync');
const fs = require('fs');
const uuid = require('uuid/v5');
const path = require('path');

let refDir = process.argv[2];
const notesFile = process.argv[3];
const inFile = process.argv[4];
const dbug = process.env.DEBUG;
const ns = 'beafd2e2-7cfd-40b9-b261-c7876aca8cbb';
const unit = '';

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
  'Completed': 'Closed',
  'Saved': 'Draft',
  'Archived': 'Closed'
};

const typeMap = {
  'E-Book Collection': 'ebook_collection', 
  Database: 'database',
  'Streaming Video': 'streaming_video',
  'Departmental Resource': 'internal_resources',
  Journal: 'journal',
  Newspaper: 'online_newspaper',
  Website: 'website',
  Any: 'any'
};

const supProps = {
  SimultaneousUsers: 'Access Simultaneous User Limit',
  ResourceURL: 'Resource URL',
  ResourceFormat: 'Resource Format',
  isbnOrIssn: 'ISBN',
  PurchaseSite: 'Purchase Site'
};

periodNotes = [
  'Order Acquisition Type',
  'Record Set Identifier',
  'Invoice Number',
  'Fund',
  'Payment Amount',
  'Year',
  'Cost Note'
];

const makeDate = (dateStr, oid) => {
  let out = '';
  try {
    out = new Date(dateStr).toISOString();
    out = out.substring(0,10);
  } catch (e) {
    console.log(`WARN [${oid}] "${dateStr}" is not a valid date`)
  }
  return out;
}

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
          });
        } else if (r.desc === 'SubscriptionAgreement.ContentType') {
          ref.contentType = {};
          r.values.forEach(v => {
            ref.contentType[v.value] = v.label;
            ref.contentType[v.label] = v.value;
          });
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
  // console.log(ref.contentType); return;

  let csv = fs.readFileSync(`${inFile}`, 'utf8');
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
    // console.log(r);
    for (let f in r) {
      r[f] = r[f].replace(/\\N/g, '');
    }
    let oid = r['Product ID'];
    let org = r['Product Organization'];
    let role = r['Product Organization Role'];
    let alt = r['Product Alias'];
    let altType = r['Product Alias Type'];
    let ostart = r['Payment Sub Start'] || ''
    let start = (ostart) ? makeDate(ostart, oid) : '';
    let oend = r['Payment Sub End'] || '';
    let end = (oend) ? makeDate(oend, oid) : '';
    
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
    let dname = r['Attachment Name'];
    let ddesc = r['Attachment Description'];
    let durl = r['Attachment URL'];
    let dtype = (r['Attachment Type']) ? r['Attachment Type'].toLowerCase() : '';
    let dkey = (dname) ? `${oid}~~${dname}~~${dtype}~~${ddesc}~~${durl}` : '';
    
    if (!ag[oid]) { 
      ag[oid] = r;
      ag[oid].xorgs = {};
      ag[oid].xper = {};
      ag[oid].xalt = [];
      ag[oid].xdoc = [];
    }
    if (org && !ag[oid].xorgs[org]) ag[oid].xorgs[org] = [];
    if (!ag[oid].xper[per]) ag[oid].xper[per] = pnoteStr;
    if (org && role && ag[oid].xorgs[org].indexOf(role) === -1) ag[oid].xorgs[org].push(role);
    if (alt && ag[oid].xalt.indexOf(alt) === -1) ag[oid].xalt.push(alt);
    if (dkey && ag[oid].xdoc.indexOf(dkey) === -1) ag[oid].xdoc.push(dkey);
  });
  // console.log(JSON.stringify(ag, null, 2)); return;

  csv = fs.readFileSync(notesFile, 'utf8');
  const notes = parse(csv, {
    columns: true,
    skip_empty_lines: true,
    delimiter: '|',
    escape: '\\',
    from: 1
  });

  let nc = 0;
  notes.forEach(n => {
    let id = n['Product ID'];
    if (ag[id]) {
      let agrName = ag[id]['Product Name'];
      let title = n['Resource Note Tab Name'];
      let note = n['Resource Note'] || n['Resource Note '];
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
  let dc = 0;
  for (let al in ag) {
    let a = ag[al];
    let cprops = {};
    for (let p in supProps) {
      cprops[p] =[{ _delete: true }];
    }
    let name = a['Product Name'];
    let desc = a['Product Description'];
    let prov = a['Product Provider'];
    let status = a['Product Status'];
    let type = a['Product Resource Type']

    // map custom props below
    let SimultaneousUsers = a['Access Simultaneous User Limit'].trim();
    let ResourceFormat = a['Resource Format'].trim();
    let rurls = []
    let rurl = a['Resource URL'].trim();
    let aurl = a['Resource Alt URL'].trim();
    if (rurl) rurls.push(rurl);
    if (aurl) rurls.push(aurl);
    ResourceURL = rurls.join('; ');
    let isbnOrIssn = a['ISBN'].trim();
    let PurchaseSite = a['Purchase Site'].trim();

    if (SimultaneousUsers) cprops.SimultaneousUsers[0].value = SimultaneousUsers;
    if (ResourceFormat) cprops.ResourceFormat[0].value = ResourceFormat.toLowerCase().replace(/\W/g, '_');
    if (ResourceURL) cprops.ResourceURL[0].value = ResourceURL;
    if (isbnOrIssn) cprops.isbnOrIssn[0].value = isbnOrIssn;
    if (PurchaseSite) cprops.PurchaseSite[0].value = PurchaseSite.toLowerCase().replace(/\W/g, '_');

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
      id: al,
      name: name,
      customProperties: cprops,
      orgs: [],
      alternateNames: [],
      periods: [],
      supplementaryDocs: []
    };

    a.xdoc.forEach(dkey => {
      let d = dkey.split(/~~/);
      let o = {
        _delete: false,
        name: d[1],
        atType: d[2],
        note: d[3],
        url: d[4]
      }
      agr.supplementaryDocs.push(o);
      dc++;
    });

    let i = 0;
    for (let orgId in a.xorgs) {
      let roles = [];
      a.xorgs[orgId].forEach(role => {
        let roleId = ref.roles[role] || '2c90b5068b6d6a83018b71272116011c';
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
    if (prov) {
      agr.description = (agr.description) ? '; ' + prov : prov;
    }

    if (type) {
      type = type.toLowerCase().trim();
      type = type.replace(/ +/g, '_');
      if (!ref.contentType[type]) {
        throw new Error(`Content type not found for "${type}"`);
      }
      agr.agreementContentTypes = [ 
        { 
          _delete: false,
          contentType: { value: type }
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
  console.log('Sup Docs:', dc);
  console.log('Notes:', nc);
  if (nc > 0) console.log('*** Make sure to run makeErmNotes.js after loading agreements! ***');
} catch (e) {
  console.log(e);
}
