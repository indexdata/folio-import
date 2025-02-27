const { parse } = require('csv-parse/sync');
const fs = require('fs');
const uuid = require('uuid/v5');
const path = require('path');
const readline = require('readline');

let refDir = process.argv[2];
const notesFile = process.argv[3];
const inFile = process.argv[4];
const dbug = process.env.DEBUG;
const ns = 'beafd2e2-7cfd-40b9-b261-c7876aca8cbb';
const unit = '';

const files = {
  agree: 'agreements.jsonl',
  rel: 'relationships.jsonl',
  notes: 'notes.jsonl'
};

const rfiles = {
  organizations: 'organizations.json',
  acquisitionsUnits: 'units.json',
  roles: 'refdata.json',
  noteTypes: 'note-types.json',
  cprops: 'custprops.json'
};

const mfiles = {
  map: 'licensesMap.jsonl',
  out: 'licensesOut.jsonl'
}

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

(async () => {
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
      } else if (f === 'cprops') {
        rdata.forEach(r => {
          ref[f][r.name] = r;
        }); 
      } else {
        rdata[f].forEach(r => {
          let k = (f === 'organizations') ? r.code : r.name;
          let v = (f === 'organizations') ? {id: r.id, name: r.name} : r.id;
          ref[f][k] = v;
        });
      }
    }
    // throw(ref.cprops);

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
    // throw(licMap);

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
      let lic = r['License ID'];
      
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
      let purs = r['Purchase Site'];
      let dkey = (dname) ? `${oid}~~${dname}~~${dtype}~~${ddesc}~~${durl}~~${purs}` : '';
      
      if (!ag[oid]) { 
        ag[oid] = r;
        ag[oid].xorgs = {};
        ag[oid].xper = {};
        ag[oid].xalt = [];
        ag[oid].xdoc = [];
        ag[oid].xlic = [];
        ag[oid].xpur = [];
      }
      if (org && !ag[oid].xorgs[org]) ag[oid].xorgs[org] = [];
      if (!ag[oid].xper[per]) ag[oid].xper[per] = pnoteStr;
      if (org && role && ag[oid].xorgs[org].indexOf(role) === -1) ag[oid].xorgs[org].push(role);
      if (alt && ag[oid].xalt.indexOf(alt) === -1) ag[oid].xalt.push(alt);
      if (lic && ag[oid].xlic.indexOf(lic) === -1) ag[oid].xlic.push(lic);
      if (dkey && ag[oid].xdoc.indexOf(dkey) === -1) ag[oid].xdoc.push(dkey);
      if (purs && ag[oid].xpur.indexOf(purs) === -1) ag[oid].xpur.push(purs);
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
        let type = n['Resource Note Type'].trim();
        let nkey = id + note + type;
        let nobj = {
          id: uuid(nkey, ns),
          title: title,
          content: `<p>${note}</p>`,
          domain: 'agreements',
          typeId: ref.noteTypes[type] || ref.noteTypes['General note'],
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
      let cdata = {};
      for (let p in ref.cprops) {
        cprops[p] =[{ _delete: true }];
      }
      let name = a['Product Name'];
      let desc = a['Product Description'];
      let prov = a['Product Provider'];
      let status = a['Product Status'];
      let type = a['Product Resource Type']

      // map custom props below
      cdata.SimultaneousUsers = a['Access Simultaneous User Limit'].trim();
      cdata.ResourceFormat = a['Resource Format'].trim();
      let rurls = []
      let rurl = a['Resource URL'].trim();
      let aurl = a['Resource Alt URL'].trim();
      if (rurl) rurls.push(rurl);
      if (aurl) rurls.push(aurl);
      cdata.ResourceURL = rurls.join('; ');
      cdata.isbnOrIssn = a['ISBN'].trim();
      if (a.xpur[0]) cdata.PurchaseSite = a.xpur;
 
      for (let p in ref.cprops) {
        let cp = ref.cprops[p];
        let ctype = cp.type.replace(/^.+\./, '');
        let name = cp.name;
        let data = cdata[name]
        if (data) {
          if (ctype === 'CustomPropertyRefdata') {
            data = data.toLowerCase().replace(/\W/g, '_');
          }
          if (ctype === 'CustomPropertyMultiRefdata') {
            let arr = [];
            data.forEach(t => {
              t = t.toLowerCase().replace(/\W/g, '_');
              arr.push({ value: t});
            });
            data = arr;
          }
          cprops[name][0].value = data;
          cprops[name][0]._delete = false;
        }
      }
      // console.log(JSON.stringify(cprops, null, 2));

      /* 
      if (SimultaneousUsers) cprops.SimultaneousUsers[0].value = SimultaneousUsers;
      if (ResourceFormat) cprops.ResourceFormat[0].value = ResourceFormat.toLowerCase().replace(/\W/g, '_');
      if (ResourceURL) cprops.ResourceURL[0].value = ResourceURL;
      if (isbnOrIssn) cprops.isbnOrIssn[0].value = isbnOrIssn;
      if (PurchaseSite) cprops.PurchaseSite[0].value = PurchaseSite.toLowerCase().replace(/\W/g, '_');
      */

      let oid = a['Product ID'];
      let relId = a['Product Related Products ID'] || '';
      let relType = a['Product Related Products Relationship Type'] ||'';

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
        agr.description = (agr.description) ? agr.description + '; ' + prov : prov;
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

    console.log('Finished!');
    console.log('Agreements:', c);
    console.log('Sup Docs:', dc);
    console.log('Notes:', nc);
    if (nc > 0) console.log('*** Make sure to run makeErmNotes.js after loading agreements! ***');
  } catch (e) {
    console.log(e);
  }
})();
