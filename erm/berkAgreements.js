const parse = require('csv-parse/lib/sync');
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
  'Completed': 'Active',
  'Saved': 'Active',
  'Archived': 'closed'
};

const typeMap = {
  'E-Book Collection': 'ebook_collection', 
  Database: 'database',
  'Streaming Video': 'streaming_video',
  'Departmental Resource': 'internal_resources',
  Journal: 'journals',
  Newspaper: 'online_newspaper',
  Website: 'website',
  Any: 'any'
};

const supProps = {
  ResourceFormat: "Resource Format",
  ResourceURL: "Resource URL",
};

periodNotes = [
  'Order Acquisition Type',
  'Invoice Number',
  'Fund',
  'Payment Amount',
  'Year',
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
  // console.log(ref); return;

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
    for (let f in r) {
      r[f] = r[f].replace(/\\N/g, '');
    }
    let oid = r['Product ID'];
    let org = r['Product Organization'];
    let role = r['Product Organization Role'];
    let alt = r['Product Alias'];
    let altType = r['Product Alias Type'];
    let ostart = r['Payment Sub Start'];
    let start = (ostart) ? new Date(ostart).toISOString() : '';
    start = start.substring(0, 10);
    let oend = r['Payment Sub End'];
    let end = (oend) ? new Date(oend).toISOString() : '';
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
    let dname = r['Attachment Name'];
    let ddesc = r['Attachment Description'];
    let durl = r['Attachment URL'];
    let dtype = r['Attachment Type'];
    let dkey = (dname) ? oid + ':' + dname : '';
    console.log(dkey);
    if (!ag[oid]) { 
      ag[oid] = r;
      ag[oid].xorgs = {};
      ag[oid].xper = {};
      ag[oid].xalt = [];
      ag[oid].xdocs = [];
    }
    if (!ag[oid].xorgs[org]) ag[oid].xorgs[org] = [];
    if (!ag[oid].xper[per]) ag[oid].xper[per] = pnoteStr;
    if (role && ag[oid].xorgs[org].indexOf(role) === -1) ag[oid].xorgs[org].push(role);
    if (alt && ag[oid].xalt.indexOf(alt) === -1) ag[oid].xalt.push(alt);
  });
  console.log(JSON.stringify(ag, null, 2)); return;

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
    let ResourceFormat = a['Resource Format'].trim();
    let ResourceURL = a['Resource URL'].trim();

    if (ResourceFormat) cprops.ResourceFormat[0].value = ResourceFormat.toLowerCase().replace(/\W/g, '_');
    if (ResourceURL) cprops.ResourceURL[0].value = ResourceURL;

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
      periods: []
    };

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
  console.log('Notes:', nc);
  if (nc > 0) console.log('*** Make sure to run makeErmNotes.js after loading agreements! ***');
} catch (e) {
  console.log(e);
}
