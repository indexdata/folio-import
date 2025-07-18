import { parseMarc, getSubs, getSubsHash } from '../js-marc/js-marc.mjs';
import fs from 'fs';
import path, { basename } from 'path';
import { v5 as uuid } from 'uuid';

let refDir = process.argv[2];
let rawFile = process.argv[3];

const ns = '346479c5-8965-4d74-a43c-5704385c2d01';

const files = {
  users: 1,
  perms: 1,
  rprefs: 1,
  notes: 1
}

const dform = (date) => {
  let out;
  out = date.replace(/^(....)(..)(..).*/, '$1-$2-$3');
  return out;
}

const writeOut = (path, data) => {
  let out = JSON.stringify(data) + '\n';
  fs.writeFileSync(path, out, { flag: 'a' });
}

try {
  if (!rawFile) throw(`Usage: node usersDera.js <ref_dir> <patron_mrc_file>`);
  const fileStream = fs.createReadStream(rawFile, { encoding: 'utf8' });
  refDir = refDir.replace(/\/$/, '');
  let fn = path.basename(rawFile, '.mrc');
  let dir = path.dirname(rawFile);

  for (let k in files) {
    files[k] = dir + '/' + fn + '-' + k + '.jsonl';
    if (fs.existsSync(files[k])) fs.unlinkSync(files[k]);
  }
  // throw(files);

  // open ref files
  let rfiles = fs.readdirSync(refDir);
  const refData = {};
  rfiles.forEach(f => {
    let fpath = `${refDir}/${f}`;
    let d = fs.readFileSync(fpath, { encoding: 'utf8' });
    let j = JSON.parse(d);
    for (let k in j) {
      let p = j[k];
      if (Array.isArray(p)) {
        refData[k] = {};
        p.forEach(o => {
          let y = o.group || o.code || o.name || o.addressType;
          let v = o.id;
          y = y.toLowerCase();
          refData[k][y] = v;
        });
      }
    }
  });
  // throw(refData);

  let start = new Date().valueOf();
  const ttl = {
    count: 0,
    users: 0,
    perms: 0,
    prefs: 0,
    notes: 0,
    errors: 0
  }
  let leftOvers = '';
  fileStream.on('data', (chunk) => {
    let recs = chunk.match(/.*?\x1D|.+$/sg);
    recs[0] = leftOvers + recs[0];
    let lastRec = recs[recs.length - 1];
    if (!lastRec.match(/\x1D/)) {
      leftOvers = lastRec;
      recs.pop();
    } else {
      leftOvers = '';
    }
    for (let k = 0; k < recs.length; k++) {
      let r = recs[k];
      ttl.count++
      let marc = {};
      try { 
        marc = parseMarc(r)
        // console.log(JSON.stringify(marc.fields, null, 2));
      } catch(e) {
        console.log(e);
        ttl.errors++;
        writeOut(outs.err, r, true);
        continue;
      }
      let f = marc.fields;
      let ctrl = (f['001'])[0];
      let f15 = f['015'];
      let bc = (f15) ? getSubs(f15[0], 'a') : ctrl;
      let pgf = f['245'];
      let gname = (pgf) ? getSubs(pgf[0], 'a') : '';
      gname = gname.toLowerCase().replace(/[.]$/, '');
      let groupId = refData.usergroups[gname];
      let f42 = f['042'];
      let enDate = (f42) ? getSubs(f42[0], 'a') : '';
      let exDate = (f42) ? getSubs(f42[0], 'b') : '';
      let f100 = f['100'];
      let name = (f100) ? getSubs(f100[0], 'a') : (f['110']) ? getSubs(f['110'][0], 'a') : '';
      let lang = (f100) ? getSubs(f100[0], 'l') : '';
      let f271 = f['271'];
      let email = (f271) ? getSubs(f271[0], 'a') : '';
      let f270 = f['270'];
      let phone = (f270) ? getSubs(f270[0], 'k') : '';
      let f500 = f['500'] || [];
      let u = {
        id: uuid(ctrl, ns),
        username: bc,
        patronGroup: groupId,
        active: true,
        personal: {},
        customFields: { previousSystemId: ctrl }
      };
      if (bc) {
        u.barcode = bc;
        u.externalSystemId = bc;
      }
      if (name) {
        let n = name.match(/^(.+?)(, (.+?)( (.+))?)?$/);
        u.personal.lastName = n[1] || name;
        if (n[3]) u.personal.firstName = n[3];
        if (n[5]) u.personal.middleName = n[5];
      }
      if (f270) {
        let ac = 0;
        f270.forEach(f => {
          let a = getSubsHash(f, true);
          if (a.a) {
            if (!u.personal.addresses) u.personal.addresses = [];
            let o = {
              addressLine1: a.a
            }
            if (a.b) o.city = a.b;
            if (a.d) o.region = a.d;
            if (a.e) o.postalCode = a.e;
            o.countryId = (a.f && a.f === 'USA') ? 'US' : 'IN';
            if (ac === 0) {
              o.addressTypeId = refData.addressTypes.home;
              o.primaryAddress = true;
            } else {
              o.addressTypeId = refData.addressTypes.work;
            }
            if (ac < 2) u.personal.addresses.push(o);
            ac++;
          }
        });
      }
      let f301 = f['301'];
      let aff = (f301) ? getSubs(f301[0], 'ad') : '';
      
      if (lang) u.customFields.preferredLanguage = lang;
      if (email) u.personal.email = email;
      if (phone) u.personal.phone = phone;
      if (enDate) u.enrollmentDate = dform(enDate);
      if (exDate) u.expirationDate = dform(exDate);
      f500.forEach(f => {
        let txt = getSubs(f, 'a');
        let id = uuid(u.id + txt, ns);
        let type = refData.noteTypes['general note'];
        let o = {
          id: id,
          typeId: type,
          title: 'Note',
          content: txt,
          popUpOnCheckOut: false,
          popUpOnUser: false,
          domain: 'users',
          links: [{ type: 'user', id: u.id }]
        };
        writeOut(files.notes, o);
        ttl.notes++;
      });

      if (process.env.DEBUG) console.log(JSON.stringify(u, null, 2));
      if (u.patronGroup) {
        if (u.personal.lastName) {
          writeOut(files.users, u);
          ttl.users++;
        
          let rpo = {
            userId: u.id,
            fulfillment: "Hold Shelf",
            holdShelf: true,
            delivery: false,
            id: uuid(u.id + 'rp', ns),
          };
          writeOut(files.rprefs, rpo);
          ttl.prefs++;
          if (process.env.DEBUG) console.log(rpo);

          let pu = {
            userId: u.id,
            permissions: [],
            id: uuid(u.id + 'pu', ns)
          };
          writeOut(files.perms, pu);
          ttl.perms++;
          if (process.env.DEBUG) console.log(pu);
        } else {
          console.log(`ERROR Can't create user for ${ctrl}`);
          ttl.errors++;
        }
      } else {
        console.log(`ERROR patron group not found for "${gname}"`);
        ttl.errors++;
      }
    }
  });
  fileStream.on('close', () => {
    let now = new Date().valueOf();
    let t = (now - start) / 1000;
    console.log('--------------------');
    ttl['time (secs)'] = t;
    if (t > 60) ttl['time (mins)'] = t / 60;
    for (let x in ttl) {
      let l = x.substring(0,1).toUpperCase() + x.substring(1);
      l = l.padEnd(12);
      let n = ttl[x].toString().padStart(8);
      console.log(l, ':', n);
    }
  });
} catch (e) {
  console.log(e);
}