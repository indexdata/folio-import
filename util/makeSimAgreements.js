const parse = require('csv-parse/lib/sync');
const fs = require('fs');
const { fileURLToPath } = require('url');
const uuid = require('uuid/v5');

const inDir = process.argv[2];
const ns = '49619de6-63fe-47e9-a07b-698a313dc9e8';



const makeMap = (coll, key) => {
  if (!key) key = 'resourceID';
  newColl = {};
  coll.forEach(r => {
    let oid = r[key];
    delete r[key];
    if (!newColl[oid]) newColl[oid] = [];
    newColl[oid].push(r);
  });
  return newColl;
};

try {
  if (!inDir) throw new Error(`Usage: node makeSimAgreements.js <working_directory>`);
  const orgsObj = require(`${inDir}/organizations.json`);
  const orgsMap = {};
  orgsObj.organizations.forEach(o => {
    orgsMap[o.name] = o;
  });
  const fns = fs.readdirSync(inDir);
  const inRecs = {};
  let orgs = [];

  let fileSeen = {};

  const writer = (name, data) => {
    let outFile = `${inDir}/${name}.jsonl`;
    if (!fileSeen[outFile] && fs.existsSync(outFile)) fs.unlinkSync(outFile);
    fs.writeFileSync(outFile, JSON.stringify(data) + '\n', { flag: 'a' });
    fileSeen[outFile] = 1;
  }

  const custProp = (name, value, cProp, isPick) => {
    let prop = {};
    if (isPick) {
      value = value.toLowerCase();
      value = value.replace(/[- ]/g, '_');
      value = value.replace(/[()]/g, '');
    }
    prop[name] = [];
    let cp = {
      value: value
    }
    prop[name].push(cp);
    if (value) {
      cProp[name] = prop[name];
    } else {
      cProp[name] = '';
    }
  }

  fns.forEach(fn => {
    if (fn.match(/\.csv$/)) {
      let name = fn.replace(/\.csv/, '');
      name = name.replace(/-(.)/g, (m) => { return m[1].toUpperCase() });
      console.log(name);
      let csv = fs.readFileSync(`${inDir}/${fn}`, 'utf8');
      csv = csv.replace(/NULL/g, '');
      inRecs[name] = parse(csv, {
        columns: true,
        skip_empty_lines: true
      });
    }
  });

  aliasMap = makeMap(inRecs.alias);
  payMap = makeMap(inRecs.payments);
  catNoteMap = makeMap(inRecs.noteCataloging);
  resNoteMap = makeMap(inRecs.noteResource);
  // console.log(resNoteMap);
  // return;

  /* make notes-types object
  const noteTypeMap = {};
  for (k in notesMap) {
    notesMap[k].forEach(nt => {
      if (nt.noteType) noteTypeMap[nt.noteType] = uuid(nt.noteType, ns);
    });
  } 
  for (n in noteTypeMap) {
    let noteType = { id: noteTypeMap[n], name: n };
    writer('note-types', noteType);
  } */

  let acount = 0;
  inRecs.resourceResources.forEach((r) => {
    acount++;
    let a = {};
    let rid = r.resourceID
    a.id = uuid(rid, ns);
    a.name = r['Agreements/Name'];
    a.description = r['Agreements/Description'];
    a.renewalPriority = {
      label: 'For review',
      value: 'for_review'
    };
    a.agreementStatus = {
      label: r['Agreements/Status'],
      value: r['Agreements/Status'].toLowerCase()
    }
    a.periods = [];
    let startDate = '';
    if (r['subscriptionStartDate']) {
      startDate = new Date(r['subscriptionStartDate']).toISOString().replace(/T.+$/, '');
    }
    let endDate = '';
    if (r['subscriptionEndDate'].match(/^[1-9]/)) {
      endDate = new Date(r['subscriptionEndDate']).toISOString().replace(/T.+$/, '');
    }
    let period = {
      startDate: startDate,
      endDate: endDate,
      owner: { id: a.id }
    }
    a.periods.push(period);
    let cProp = {};
    custProp('resourceURL', r['Resource URL'], cProp);
    custProp('resourceAltURL', r['resourceAltURL'], cProp);
    if (resNoteMap[rid]) {
      let resNotes = [];
      resNoteMap[rid].forEach(rn => {
        resNotes.push(`${rn.noteType}: ${rn.note}`);
      });
      custProp('resourceNote', resNotes.join('\n\n'), cProp);
    }
    if (catNoteMap[rid]) {
      let catNotes = [];
      catNoteMap[rid].forEach(cn => {
        catNotes.push(cn.catalogingNote);
      });
      custProp('catalogingNotes', catNotes.join('\n\n'), cProp);
    }
    custProp('acquisitionType', r.acquisitionType, cProp, true);
    custProp('userLimit', r['Simultaneous User Limit'], cProp);
    custProp('accessMethod', r['Access Method'], cProp, true);
    custProp('authenticationUsernamePassword', r['authenticationUserPassword'], cProp);
    custProp('instanceHRID', r['Bib Record'], cProp);
    custProp('MARCsourceURL', r['MARC URL'], cProp);
    custProp('marcSource', r['MARC Source'], cProp, true);
    custProp('catalogingLevel', r['Cataloging Level'], cProp, true);
    custProp('catalogUsernamePassword', r['Record Source Login'], cProp);
    custProp('notificationType', r['Notification Type'], cProp)
    let ocHold = 'no';
    if (r['OCLC Holdings'] === 'Yes') ocHold = 'yes'
    custProp('OCLCHoldings', ocHold, cProp);

    a.customProperties = cProp;
    let orgObj = orgsMap[r['Organization']];
    if (orgObj) {
      a.orgs = [];
      let org = {
        org: { 
          orgsUuid: orgObj.id,
          name: orgObj.name
        },
        role: 'vendor'
      };
      a.orgs.push(org);
    }
    if (aliasMap[rid]) {
      a.alternateNames = [];
      aliasMap[rid].forEach(alias => {
        a.alternateNames.push({ name: alias['Agreements/Alternative Name'] });
      });
    }
    if (payMap[rid]) {
      payMap[rid].forEach(p => {
        let ent = {};
        ent.id = uuid(p.resourcePaymentID + 'resourcePaymentID', ns)
        ent.description = p['Agreement Line/Description'];
        ent.owner = a.name;
        ent.type = 'detached';
        ent.suppressFromDiscovery = false;
        writer('entitlements', ent);
      });
    }
    writer('resources', a);
  });

  const makeLine = (sheet, owner, titleField, fromField, toField) => {
    for (let key in inRecs[sheet][0]) {
      if (key.match(/Description/)) titleField = key;
      if (key.match(/Active from/)) fromField = key;
      if (key.match(/Active to/)) toField = key;      
    }
    console.log(titleField);
    inRecs[sheet].forEach(r => {
      let ent = {};
      ent.owner = owner;
      ent.type = 'detached';
      ent.suppressFromDiscovery = false;
      ent.description = r[titleField];
      console.log(ent.description);
      let from = r[fromField];
      if (from) {
        try {
            from = new Date(from).toISOString();
            from = from.replace(/T.+$/, '');
        } catch (e) {
          console.log(`${e}: ${from}`);
        }
      }
      ent.activeFrom = from;
      let to = r[toField];
      if (to) {
        try {
          to = new Date(to).toISOString();
          to = to.replace(/T.+$/, '');
        } catch (e) {
          console.log(`${e}: ${to}`);
        }
      }
      ent.activeTo = to;
      let note = `${r.description2} ${r.systemNumber} ${r.resourceNote} ${r.resourcePayment}`;
      ent.note = note.trim();
      writer('entitlements', ent);
    });
  }

  makeLine('resourceKanopy', 'Kanopy');
  makeLine('resourceSwank', 'Swank');
  makeLine('resourceAlexander', 'Alexander Street Press');
  makeLine('resourceDocuseek', 'Docuseek');
  makeLine('resourceFilmPlatform', 'Film Platform');
  makeLine('resourceFod', 'Films Media Group / Films on Demand');
  makeLine('resourceGoodDocs', 'Good Docs');
  makeLine('resourceInsight', 'Insight Media');
  makeLine('resourceNcherm', 'NCHERM Group');
  makeLine('resourceNewDay', 'New Day Films / New Day Digital');
  makeLine('resourcePsychotherapy', 'Psychotherapy.NET 2');
  makeLine('resourceTugg', 'Tugg Streaming');
  makeLine('resourceWorldTrust', 'World Trust');
  
} catch (e) {
  console.log(e);
}
