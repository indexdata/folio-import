const { parse } = require('csv-parse/sync');
const fs = require('fs');
const path = require('path');

let refDir = process.argv[2];
const inFile = process.argv[3];
const dbug = process.env.DEBUG;
const ns = '1bfe31fb-27fb-402c-9f3a-67ce3cf22565';
const unit = '';

const files = {
  lic: 'licenses.jsonl',
  map: 'licensesMap.jsonl'
};

const rfiles = {
  organizations: 'organizations.json',
  cprops: 'custprops.json',
  ref: 'refdata.json'
};

const statusMap = {
  'Awaiting Document': 'in_negotiation',
  'Complete': 'active',
  'Document Only': 'active',
};

const docNoteFields = [ 'Document Effective Date' ];

const scriptName = process.argv[1].replace(/^.+\//, '');

try {
  if (!inFile) throw(`Usage: node.js ${scriptName} <ref_dir> <licenses_csv_file>`);

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
  const custProps = {};
  const custTypes = {};
  for (let f in rfiles) {
    let rfile = refDir + '/' + rfiles[f];
    let rdata = require(rfile);
    ref[f] = {};
    if (f === 'cprops') {
      rdata.forEach(r => {
        let k = r.label;
        let v = r.name;
        ref[f][k] = v;
        custProps[v] = [{ _delete: true }];
        custTypes[v] = r.type.replace(/^.+\./, '');
      });
    } else if (f === 'ref') {
      rdata.forEach(r => {
        let k = r.desc;
        ref[f][k] = {};
        r.values.forEach(v => {
          ref[f][k][v.label] = v.id;
          ref[f][k][v.value] = v.id;
        });
      });
    } else {
      rdata[f].forEach(r => {
        let k = (f === 'organizations') ? r.code : r.name;
        let v = (f === 'organizations') ? {id: r.id, name: r.name} : r.id;
        ref[f][k] = v;
      });
    }
  }
  // console.log(custTypes); return;

  let csv = fs.readFileSync(`${inFile}`, 'utf8');

  const inRecs = parse(csv, {
    columns: true,
    skip_empty_lines: true,
    delimiter: '|',
    bom: true,
    escape: '\\'
  });

  let today = new Date().toISOString().substring(0, 10);
  const seen = {
    main: {},
    org: {},
    doc: {},
    ex: {}
  }
  let l;
  let last = inRecs.length;
  let prevId = 0;
  let c = 0;
  const stats = {
    licenses: 0,
    orgs: 0,
    docs: 0,
    terms: 0
  }
  inRecs.forEach(r => {
    c++;
    for (let f in r) {
      r[f] = r[f].replace(/\\N/g, '');
    }
    let id = r['License ID'];

    let oid = r['License Organization'];
    let orgKey = id + ':' + oid;

    let docName = r['Document Name'];
    let docType = r['Document Type'];
    let docNotes= [];
    docNoteFields.forEach(f => {
      if (r[f]) docNotes.push(`${f}: ${r[f]}`);
    });
    let docNote = docNotes.join('; ')
    let docKey = id + ':' + docName + ':' + docType;

    let exType = r['Expression Type'];
    let exQual = r['Expression Qualifier'];
    let exText = r['Expression Document Text'];
    let exNote = r['Expression Note'];
    let exKey = id + ':' + exType + ':' + exText + ':' + exQual;

    if (l && prevId !== id) {
      writeTo(files.lic, l);
    }

    if (!seen.main[id]) {
      let status = r['License Status'];
      let name = r['License Name'];
      let newCust = JSON.parse(JSON.stringify(custProps));
      l = {
        id: id,
        name: name,
        status: statusMap[status],
        type: 'local',
        openEnded: false,
        customProperties: newCust,
        orgs: [],
        supplementaryDocs: [],
      };
      seen.main[id] = 1;
      stats.licenses++;
      let moj = { name: name, id: id };
      writeTo(files.map, moj);
    }

    if (!seen.ex[exKey]) {
      let exTypeValue = ref.cprops[exType];
      if (exTypeValue) {
        let ctype = custTypes[exTypeValue];
        if (l.customProperties[exTypeValue]) {
          if (ctype && ctype === 'CustomPropertyMultiRefdata') {
            let text = exQual.toLowerCase().replace(/ /g, '_');
            exQual = (text) ? [ { value: text } ] : [];
          }
          l.customProperties[exTypeValue][0] = {
            _delete: false,
            value: exQual || '[No text]',
            note: exNote,
            publicNote: exText
          }
        }
      }
      seen.ex[exKey] = 1;
      stats.terms++;
    }

    if (!seen.org[orgKey]) {
      let org = ref.organizations[oid];
      if (org) {
        let o = {
          _delete: false,
          roles: [ 
            {
              role: { 
                id: ref.ref['LicenseOrg.Role'].licensor 
              } 
            } 
          ],
          org: {
            orgsUuid: org.id,
            name: org.name
          },
          primaryOrg: true
        }
        l.orgs.push(o);
        stats.orgs++;
      } else {
        console.log(`WARN organization not found for ID ${oid}`);
      }
      seen.org[orgKey] = 1;
    }
    if (!seen.doc[docKey]) {
      let atTypeValue = ref.ref['DocumentAttachment.AtType'][docType];
      let dfile = r['Document File'] || '';
      let url = r['Signature'] || '';
      let o = {
        _delete: false,
        name: docName,
        atType: atTypeValue,
        note: docNote,
      };
      if (dfile) o.location = dfile;
      if (url) o.url = url;
      l.supplementaryDocs.push(o);
      stats.docs++;
      seen.doc[docKey] = 1;
    }

    if (c === last) {
      writeTo(files.lic, l);
    }
    
    prevId = id;
    
  });
  
  console.log('Finished!');
  for (let k in stats) {
    console.log(k + ':', stats[k]);
  }
} catch (e) {
  console.log(e);
}
