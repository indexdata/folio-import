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

  let fileSeen = {};

  const writer = (name, data) => {
    let outFile = `${inDir}/${name}.jsonl`;
    if (!fileSeen[outFile] && fs.existsSync(outFile)) fs.unlinkSync(outFile);
    fs.writeFileSync(outFile, JSON.stringify(data) + '\n', { flag: 'a' });
    fileSeen[outFile] = 1;
  }

  fns.forEach(fn => {
    if (fn.match(/\.csv$/)) {
      let name = fn.replace(/.+_(.+?)\.csv/, '$1');
      // console.warn(`Creating object: ${name}`);
      let csv = fs.readFileSync(`${inDir}/${fn}`, 'utf8');
      csv = csv.replace(/NULL/g, '');
      inRecs[name] = parse(csv, {
        columns: true,
        skip_empty_lines: true
      });
    }
  });

  const aliasMap = makeMap(inRecs.alias);
  const aliasTypeMap = makeMap(inRecs.aliastype, 'aliasTypeID');
  const orgRoleMap = makeMap(inRecs.organizationroleprofile);
  const roleMap = makeMap(inRecs.contactroleprofile, 'contactID');

  const catMap = {};
  inRecs.contactrole.forEach(r => {
    let cat = {}
    let id = uuid(r.contactRoleID + r.shortName, ns);
    cat.value = r.shortName;
    if (r.shortName === 'Accounting') {
      catMap[r.contactRoleID] = 'ab760714-4185-4859-b0dd-3e72f01c5c52' // Accounting
    } else if (r.shortName === 'Sales') {
      catMap[r.contactRoleID] = 'c4d4805e-7ee8-499d-abe6-1b42105d8af8' // Sales
    } else if (r.shortName === 'Support') {
      catMap[r.contactRoleID] = '5605ef42-9c35-4b28-bc33-e82e9b6aa1ec' // Tecnical support
    }else {
      catMap[r.contactRoleID] = 'f52ceea4-8e35-404b-9ebd-5c7db6613195'; // Customer service
    }
  })

  // create contacts objects and map
  const contactMap = {};
  inRecs.contact.forEach(c => {
    con = {}
    let id = uuid(c.contactID + 'contactID', ns);
    con.id = id;
    let oid = c.organizationID;
    if (!contactMap[oid]) contactMap[oid] = [];
    contactMap[oid].push(id);
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
    if (roleMap[c.contactID]) {
      con.categories = [];
      roleMap[c.contactID].forEach(r => {
        con.categories.push(catMap[r.contactRoleID]);
      });
    }
    writer('contacts', con);
  });

  // create interface objects and map;
  ifaceMap = {}
  ifaceTypes = {
    '1': 'Admin',
    '2': 'Other',
    '3': 'Other',
    '4': 'Reports',
    '5': 'Other',
    '6': 'Other'
  }
  inRecs.externallogin.forEach(i => {
    let iface = {};
    let id = uuid(i.externalLoginID + 'externalLoginID', ns);
    if (!ifaceMap[i.organizationID]) ifaceMap[i.organizationID] = [];
    ifaceMap[i.organizationID].push(id);
    iface.id = id;
    iface.name = `Interface ${i.externalLoginID}`;
    if (i.loginURL) {
      iface.uri = i.loginURL;
      iface.deliveryMethod = 'Online';
    } else {
      iface.deliveryMethod = 'Other';
    }
    if (i.noteText) iface.notes = i.noteText;
    iface.available = true;
    iface.type = [ ifaceTypes[i.externalLoginTypeID] ];

    // create credentials object
    if (i.username && i.password) {
      let cred = {};
      cred.id = uuid(id, ns);
      cred.interfaceId = id;
      cred.username = i.username;
      cred.password = i.password;
      writer('credentials', cred);
    }
    writer('interfaces', iface);
  });

  // create organizations object
  inRecs.organization.forEach(o => {
    let org = {}
    let id = o.organizationID;
    org.name = o.name;
    org.id = uuid(id, ns);
    org.status = 'Active';
    org.language = 'eng';
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
        isPrimary: true,
        language: 'eng'
      };
      org.urls.push(url);
    }
    org.code = code.substr(0, 4) + id;
    org.description = o.accountDetailText;
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
    if (contactMap[id]) {
      org.contacts = [];
      contactMap[id].forEach(c => {
        org.contacts.push(c);
      });
    }
    if (ifaceMap[id]) {
      org.interfaces = [];
      ifaceMap[id].forEach(i => {
        org.interfaces.push(i);
      });
    }
    writer('organizations', org);
    if (o.noteText) {
      let note = {
        id: uuid(id + 'note', ns),
        domain: 'organizations',
        title: o.noteText.replace(/(\S+ \S+ \S+).*/s, '$1...'),
        content: o.noteText,
        links: [{ type: 'organization', id: org.id }]
      };
      writer('notes', note);
    }
  });
} catch (e) {
  console.log(e);
}
