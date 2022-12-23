const fs = require('fs');
const readline = require('readline');
const path = require('path');
const uuid = require('uuid/v5');
const argv = require('minimist')(process.argv.slice(2));

const ns = 'e35dff4e-9035-4d6a-b621-3d42578f81c7';

const files = {
  orgs: 'organizations.jsonl',
  notes: 'org-notes.jsonl',
  contacts: 'contacts.jsonl',
  cmap: 'codemap.json',
};

const unitsMap = {
  'CU Boulder': '24c4baf7-0653-517f-b901-bde483894fdd'
}

const col = { a:0, b:1, c:2, d:3, e:4, f:5, g:6, h:7, i:8, j:9, k:10, l:11, m:12, n:13, o:14, p:15, q:16, r:17, 
  s:18, t:19, u:20, v:21, w:22, x:23, y:24, z:25, aa:26, ab:27, ac:28, ad:29, ae:30, af:31, ag:32, ah:33, ai:34, 
  aj:35, ak:36, al:37, am: 38, an: 39 };

for (let k in col) {
  if (k != 'a') col[k] = col[k]+1;
}

(async () => {
  try {
    const inFile = argv._[0];
    if (!inFile) {
      throw 'Usage: node cubOrgs.js <organizations_tsv_file>';
    } else if (!fs.existsSync(inFile)) {
      throw new Error('Can\'t find input file');
    }
    const writeObj = (fn, data) => {
      const jsonStr = JSON.stringify(data);
      fs.writeFileSync(fn, jsonStr + '\n', { flag: 'a' });
    }
    const dir = path.dirname(inFile);
    
    for (let f in files) {
      let file = dir + '/' + files[f];
      if (fs.existsSync(file)) fs.unlinkSync(file);
      files[f] = file;
    }

    const fileStream = fs.createReadStream(inFile);

    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });

    const ttls = {
      ttl: 0,
      orgs: 0,
      notes: 0,
      contacts: 0
    }

    let x = 0;
    const sl = 1;
    const seen = {};
    const cmap = {};
    for await (const line of rl) {
      x++;
      if (x > sl) {
        let org = {};
        let c = line.split(/\t/);
        let code = c[col.e];
        if (!seen[code]) {
          let id = uuid(code + 'orgs', ns);
          let altCode = c[1];
          if (altCode) {
            cmap[altCode] = { id: id, code: c[0] };
          }
          org.id = id;
          org.name = c[col.d];
          org.code = c[col.e];
          org.status = 'Active';
          org.isVendor = true;
          let unit = c[col.an];
          if (unitsMap[unit]) org.acqUnitIds = [ unitsMap[unit] ];
          let email = c[col.m];
          if (email) {
            let e = { value: email };
            if (!org.emails) { 
              e.isPrimary = true;
              org.emails = [];
            } else {
              e.isPrimary = false;
            }
            org.emails.push(e);
          }
          let url = c[col.n];
          if (url) {
            if (!url.match(/^http|^ftp/)) url = 'http://' + url;
            let e = { value: url };
            if (!org.urls) {
              e.isPrimary = true;
              org.urls = [];
            } else {
              e.isPrimary = false;
            }
            org.urls.push(e);
          }
          let con = c[col.o];
          let conseen = {};
          if (con) {
            let fn = con.replace(/^(.+)\ .+/, '$1');
            let ln = con.replace(/^.+\ (.+)/, '$1');
            let e = { firstName: fn, lastName: ln };
            let id = uuid(con + 'con', ns);
            e.id = id;
            if (!org.contacts) {
              org.contacts = [];
            }
            org.contacts.push(id);
            if (!conseen[id]) {
              writeObj(files.contacts, e);
              ttls.contacts++;
            }
            conseen[id] = 1;

          }
          writeObj(files.orgs, org);
          ttls.orgs++;
          seen[code] = 1;
          ttls.ttl++;
        } else {
          console.log(`WARN Code ${code} already used. Skipping...`);
        }
      }
    }
    fs.writeFileSync(files.cmap, JSON.stringify(cmap, null, 2));

    console.log('---------------------');
    for (let t in ttls) {
      console.log(`${t} :`, ttls[t]);
    }
  } catch (e) {
    console.log(e);
  }
})();