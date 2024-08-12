const parse = require('csv-parse/lib/sync');
const fs = require('fs');
const path = require('path');

let refDir = process.argv[2];
const inFile = process.argv[3];
const dbug = process.env.DEBUG;
const ns = '3f32a0f4-be48-4cba-b02e-27633ca9518f';
const unit = 'Boston';

const files = {
  lic: 'licenses.jsonl',
  map: 'licensesMap.jsonl'
};

const rfiles = {
  organizations: 'organizations.json',
  cprops: 'licenses-custprops.json',
  ref: 'licenses-refdata.json'
};

const statusMap = {
  'Document Only': 'in_negotiation',
  'Active': 'active',
  'In Review': 'not_yet_active',
  'Rejected': 'rejected',
  'Archived': 'expired'
};

const picks = {
  "DTM": 1,
  "ArchivingProvisions": 1,
  "AutoRenew": 1,
  "CancellationNotification": 1,
  "ConfidentialityClause": 1,
  "Coursepacks": 1,
  "DisabilityCompliance": 1,
  "eReserves": 1,
  "Indemnification": 1,
  "InterlibraryLoan": 1,
  "NetPay": 1,
  "UserConfidentiality": 1,
  "Warranty": 1
};

docNoteFields = [ 'Signature', 'Document Effective Date' ];

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
    for (let k in data.customProperties) {
      if (data.customProperties[k][0].value === undefined) delete data.customProperties[k];
    }
    let outStr = JSON.stringify(data) + '\n';
    fs.writeFileSync(fileName, outStr, { flag: 'a' });
  }
  
  refDir = refDir.replace(/\/$/, '');
  const ref = {};
  const custProps = {};
  const legalValues = {};
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
        if (r.category && r.category.values) {
          legalValues[v] = {};
          r.category.values.forEach(c => {
            legalValues[v][c.value] = 1;
          });
        }
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
        let k = (f === 'organizations') ? r.name : r.name;
        let v = (f === 'organizations') ? {id: r.id, name: r.name} : r.id;
        ref[f][k] = v;
      });
    }
  }
  // console.log(JSON.stringify(legalValues, null, 2)); return;

  let csv = fs.readFileSync(`${inFile}`, 'utf8');

  const inRecs = parse(csv, {
    columns: true,
    skip_empty_lines: true,
    delimiter: '|',
    bom: true,
    escape: '"'
  });

  let today = new Date().toISOString().substring(0, 10);
  const seen = {
    main: {},
    org: {},
    con: {},
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
    let id = r['License Name'];

    let oid = r['License Organization'];
    let orgKey = id + ':' + oid;
    let cid = r['License Consortium'];
    let conKey = id + ':' + cid;

    let docName = r['Document Name'];
    let docType = r['Document Type'];
    let docNotes= [];
    docNoteFields.forEach(f => {
      if (r[f]) docNotes.push(`${f}: ${r[f]}`);
    });
    let docNote = docNotes.join('; ')
    let docKey = id + ':' + docName + ':' + docType;

    let exType = r['Expression Type'];
    let exText = r['Expression Document Text'];
    let exNote = r['Expression Note'];
    let exQual = r['Expression Qualifier'];
    let exQuals;
    if (exQual) {
      exQuals = exQual.split(/; */);
      for (let x = 0; x < exQuals.length; x++) {
        exQuals[x] = exQuals[x].toLowerCase();
        exQuals[x] = exQuals[x].replace(/[, ]/g, '_');
      };
    }

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
        type: 'national',
        openEnded: false,
        customProperties: newCust,
        orgs: [],
        docs: [],
      };
      seen.main[id] = 1;
      stats.licenses++;
      let moj = { name: name, id: id };
      writeTo(files.map, moj);
    }

    if (!seen.ex[exKey]) {
      let exTypeValue = ref.cprops[exType];
      if (exTypeValue) {
        let isMulti = (exTypeValue.match(/AuthenticationMethod|AuthorizedUsers|PerpetualAccess/)) ? true : false;
        if (l.customProperties[exTypeValue]) {
          if (isMulti) {
            l.customProperties[exTypeValue][0] = {
              _delete: false,
              value: []
            };
            if (exQuals) {
              exQuals.forEach(q => {
                if (legalValues[exTypeValue][q]) { 
                  l.customProperties[exTypeValue][0].value.push({ value: q });
                } else {
                  console.log(`WARN [${l.name} (${exTypeValue})] "${q}" is not a legal picklist value!`);
                }
              });
            }
          } else if (picks[exTypeValue]) {
            if (exQuals) {
              let q = exQuals[0];
              if (!legalValues[exTypeValue][q]) {
                console.log(`WARN [${l.name}] "${q}" is not a legal picklist value!`);
              } else {
                l.customProperties[exTypeValue][0] = {
                  _delete: false,
                  value: exQuals[0]
                };
              }
            }
          } else if (exText) {
            l.customProperties[exTypeValue][0] = {
              _delete: false,
              value: exText,
            };
          }
          if (exText) {
            l.customProperties[exTypeValue][0].publicNote = exText;
          }
          if (exNote) {
            l.customProperties[exTypeValue][0].note = exNote;
          }
        }
      }
      seen.ex[exKey] = 1;
      
      stats.terms++;
    }

    let conPrimary = true;
    if (oid && !seen.org[orgKey]) {
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
      conPrimary = false;
    }

    if (cid && !seen.con[conKey]) {
      let org = ref.organizations[cid];
      if (org) {
        let o = {
          _delete: false,
          roles: [ 
            {
              role: { 
                id: ref.ref['LicenseOrg.Role'].consortium 
              } 
            } 
          ],
          org: {
            orgsUuid: org.id,
            name: org.name
          },
          primaryOrg: conPrimary
        }
        l.orgs.push(o);
        stats.orgs++;
      } else {
        console.log(`WARN organization not found for ID ${cid}`);
      }
      seen.con[conKey] = 1;
    }

    if (!seen.doc[docKey]) {
      let atTypeValue = ref.ref['DocumentAttachment.AtType'][docType];
      let dfile = r['Document File'] || '';
      let url = r['Document URL'] || r['Document URL '];
      let o = {
        _delete: false,
        name: docName,
        atType: atTypeValue,
        note: docNote,
      };
      if (dfile) o.location = dfile;
      if (url) o.url = url;
      l.docs.push(o);
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
