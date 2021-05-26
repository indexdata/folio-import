/*
  This script will atempt create 5 objects:
    contacts
    credentials
    interfaces
    organizations
    notes
  
  ...from Sierra output.
*/

const parse = require('csv-parse/lib/sync');
const fs = require('fs');
const uuid = require('uuid/v5');
const path = require('path');

const fn = process.argv[2];
const ns = '8f4a5c7a-2c6e-4171-a57e-d038642b3b9c';

const makeMap = (coll, key) => {
  if (!key) key = 'organizationID';
  newColl = {};
  if (coll) {
    coll.forEach(r => {
      let oid = r[key];
      delete r[key];
      if (!newColl[oid]) newColl[oid] = [];
      newColl[oid].push(r);
    });
  }
  return newColl;
};

try {
  if (!fn) throw new Error(`Usage: node makeHolyCrossOrgs.js <sierra csv file>`);
  let inDir = path.dirname(fn);
  let inRecs;
  let orgs = [];

  let fileSeen = {};

  const writer = (name, data) => {
    let outFile = `${inDir}/${name}.jsonl`;
    if (!fileSeen[outFile] && fs.existsSync(outFile)) fs.unlinkSync(outFile);
    fs.writeFileSync(outFile, JSON.stringify(data) + '\n', { flag: 'a' });
    fileSeen[outFile] = 1;
  }

  let csv = fs.readFileSync(fn, 'utf8');
  csv = csv.replace(/NULL/g, '');
  inRecs = parse(csv, {
    columns: true,
    skip_empty_lines: true
  });

  groupedRecs = {};
  inRecs.forEach(r => {
    if (!groupedRecs[r.id]) groupedRecs[r.id] = [];
    groupedRecs[r.id].push(r);
  });

  console.log(groupedRecs[506807141559]);

  const aliasMap = makeMap(inRecs.alias);
  const aliasTypeMap = makeMap(inRecs.aliastype, 'aliasTypeID');
  const orgRoleMap = makeMap(inRecs.organizationroleprofile);
  const roleMap = makeMap(inRecs.contactroleprofile, 'contactID');

  const catMap = {};
  if (inRecs.contactrole) {
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
    });
  }

  // create contacts objects and map
  const contactMap = {};
  if (inRecs.contact) {
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
  }

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
  if (inRecs.externallogin) {
    inRecs.externallogin.forEach(i => {
      let iface = {};
      let id = uuid(i.id + 'externalLoginID', ns);
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
  }

  // create organizations object
  let i = 0;
  for (const id in groupedRecs) {
    i++;
    let o = groupedRecs[id][0];
    let org = {}
    org.name = o.vendor_name;
    org.id = uuid(id, ns);
    org.status = o.status;
    org.language = 'eng';
    org.isVendor = true;
    org.code = o.code;
    org.addresses = [];
    org.phoneNumbers = [];
    let phSeen = {};
    let faxSeen = {};
    groupedRecs[id].forEach((r, index) => {
      // get addresses
      let addr = {};
      r.addr1 = r.addr1.replace(/\$/g, ', ');
      addr.addressLine1 = r.addr1;
      addr.addressLine2 = (r.addr3) ? `${r.addr2}, ${r.addr3}` : r.addr2;
      addr.city = r.city;
      addr.stateRegion = r.region;
      addr.zipCode = (r.postal_code) ? r.postal_code.padStart(5, '0') : '';
      addr.country = r.country;
      addr.isPrimary = (index === 0) ? true : false;
      org.addresses.push(addr);
      
      // get phone numbers
      let ph = {};
      if (r.phone) {
        ph.phoneNumber = r.phone;
        ph.type = 'Office';
        ph.isPrimary = (org.phoneNumbers.length > 0) ? false : true;
        if (!phSeen[r.phone]) org.phoneNumbers.push(ph);
        phSeen[r.phone] = 1;
      }
      let fax = {};
      if (r.fax) {
        fax.phoneNumber = r.fax;
        fax.type = 'Fax';
        fax.isPrimary = false;
        if (!faxSeen[r.fax]) org.phoneNumbers.push(fax);
        faxSeen[r.fax] = 1;
      }
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
    console.log(org);
    if (o.noteText) {
      let note = {
        id: uuid(id + 'note', ns),
        domain: 'organizations',
        typeId: 'b4f58cfb-6b87-44d6-abc2-4d1eb49781a9', // general
        title: o.noteText.replace(/(\S+ \S+ \S+).*/s, '$1...'),
        content: o.noteText,
        links: [{ type: 'organization', id: org.id }]
      };
      writer('notes', note);
    }
    if (i === 5) break;
  }
} catch (e) {
  console.log(e);
}
