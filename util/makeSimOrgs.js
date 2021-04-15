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
const orgRoleMap = makeMap(inRecs.organizationroleprofile);
// console.log(orgRoleMap);

inRecs.contact.forEach(c => {
  con = {}
  let id = uuid(c.contactID + c.name, ns);
  con.id = id;
  con.firstName = c.name.replace(/^(.+) .+/, '$1') || 'Unknown';
  con.lastName = c.name.replace(/^.+ (.+)/, '$1') || 'Unknown';
  let notes = [];
  if (c.title) notes.push(c.title);
  if (c.noteText) notes.push(c.noteText);
  if (notes.length > 0) con.notes = notes.join('; ');
  if (c.addressText) {
    con.addresses = [];
    let add = {};
    add.id = uuid(id + c.addressText, ns);
    let lines = c.addressText.split(/\n/);
    add.addressLine1 = lines.shift();
    let ll = lines.pop();
    add.addressLine2 = lines.join(', ');
    if (ll) {
      add.city = ll.replace(/^(.+?),.*/, '$1');
      add.stateRegion = ll.replace(/^.*\b([A-Z]{2})\b.*$|.*/, '$1');
      add.zipCode = ll.replace(/^.*(\d{5}(-\d{4})?).*$|.*/, '$1');
      add.country = ll.replace(/.*\d{4}[, ]+(.+)$|.*/, '$1');
    }
    add.isPrimary = true;
    con.addresses.push(add);
  }
  con.phoneNumbers = [];
  if (c.phoneNumber) {
    let ph = {};
    // ph.id = uuid(id + c.phoneNumber, ns);
    ph.phoneNumber = c.phoneNumber;
    ph.isPrimary = true;
    ph.type = 'Office';
    con.phoneNumbers.push(ph);
  }
  if (c.altPhoneNumber) {
    let ph = {};
    // ph.id = uuid(id + c.altPhoneNumber, ns);
    ph.phoneNumber = c.altPhoneNumber;
    ph.isPrimary = false;
    ph.type = 'Other';
    con.phoneNumbers.push(ph);
  }
  if (c.faxNumber) {
    let ph = {};
    // ph.id = uuid(id + c.faxNumber, ns);
    ph.phoneNumber = c.faxNumber;
    ph.isPrimary = false;
    ph.type = 'Fax';
    con.phoneNumbers.push(ph);
  }
  if (c.emailAddress) {
    con.emails = [];
    let em = {};
    // em.id = uuid(id + c.emailAddress, ns);
    em.value = c.emailAddress;
    em.isPrimary = true;
    con.emails.push(em);
  }
  console.log(con);
});

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
  org.isVendor = false;
  if (orgRoleMap[id]) {
    orgRoleMap[id].forEach(r => {
      if (r.organizationRoleID === '6') org.isVendor = true;
    });
  }
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
  // console.log(JSON.stringify(org));
});


} catch (e) {
  console.log(`${e}`);
}
