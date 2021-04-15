const parse = require('csv-parse/lib/sync');
const fs = require('fs');
const uuid = require('uuid/v5');

const inDir = process.argv[2];
const ns = '49619de6-63fe-47e9-a07b-698a313dc9e8';

const makeMap = (coll, key) => {
  if (!key) key = 'organizationID';
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
  if (!inDir) throw new Error(`Usage: node makeOrgs.js <working_directory>`);
  const fns = fs.readdirSync(inDir);
  const inRecs = {};
  let orgs = [];

  fns.forEach(fn => {
    let name = fn.replace(/.+_(.+?)\.csv/, '$1');
    console.warn(`Creating object: ${name}`);
    let csv = fs.readFileSync(`${inDir}/${fn}`, 'utf8');
    csv = csv.replace(/NULL/g, '');
    inRecs[name] = parse(csv, {
      columns: true,
      skip_empty_lines: true
    });
  });

const aliasMap = makeMap(inRecs.alias);
const aliasTypeMap = makeMap(inRecs.aliastype, 'aliasTypeID');
// console.log(aliasTypeMap);

inRecs.organization.forEach(o => {
  let org = {}
  let id = o.organizationID;
  org.name = o.name;
  org.id = uuid(id, ns);
  org.status = 'Active';
  let code = '';
  let nameWords = o.name.split(/\W/);
  nameWords.forEach(nw => {
    code += nw.replace(/^(.{4}).*/, '$1').toUpperCase();
  });
  org.urls = [];
  if (o.companyURL) {
    url = {
      id: uuid(o.companURL + id, ns),
      value: o.companyURL,
      isPrimary: true
    };
    org.urls.push(url);
  }
  org.code = code.substr(0, 4) + id;
  org.description = o.accountDetailText;
  org.notes = o.noteText;
  if (aliasMap[id]) {
    org.aliases = [];
    aliasMap[id].forEach(a => {
      let alias = {
        name: a.name,
        description: aliasTypeMap[a.aliasTypeID][0].shortName
      }
      org.aliases.push(alias);
    });
  }
  // console.log(o);
  console.log(JSON.stringify(org, null, 2));
});


} catch (e) {
  console.log(`${e}`);
}
