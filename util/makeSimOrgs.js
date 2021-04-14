const parse = require('csv-parse/lib/sync');
const fs = require('fs');
const uuid = require('uuid/v5');

const inDir = process.argv[2];
const ns = '49619de6-63fe-47e9-a07b-698a313dc9e8';

try {
  if (!inDir) throw new Error(`Usage: node makeOrgs.js <working_directory>`);
  const fns = fs.readdirSync(inDir);
  const inRecs = {};
  let orgs = [];

  fns.forEach(fn => {
    let name = fn.replace(/.+_(.+?)\.csv/, '$1');
    console.log(`Creating object: ${name}`);
    let csv = fs.readFileSync(`${inDir}/${fn}`, 'utf8');
    inRecs[name] = parse(csv, {
      columns: true,
      skip_empty_lines: true
    });
  });

inRecs.organization.forEach(o => {
  let org = {}
  org.name = o.name;
  org.id = uuid(o.organizationID, ns);
  let code = o.name.replace(/\W/, '');
  org.code = code;
  console.log(o);
  console.log(org);
});


} catch (e) {
  console.log(`${e}`);
}
