const fs = require('fs');
const readline = require('readline');
const uuid = require('uuid/v5');
const path = require('path');

let refDir = process.argv[2];
let usersDir = process.argv[3];
let etcDir = '../etc/pma';

const ns = '53fdafa5-df44-4e0a-a9af-c3740938f5ff';

const inFiles = {
  users: 'z303.seqaa',
  local: 'z305.seqaa',
  addrs: 'z304.seqaa',
  ids: 'z308.seqaa'
}
if (process.env.TEST) inFiles.users = 'z303-test.seqaa';

const files = {
  users: 'users.jsonl',
  perms: 'perms.jsonl',
  err: 'create-errors.jsonl'
};

const rfiles = {
  addressTypes: 'addresstypes.json',
  usergroups: 'groups.json',
  noteTypes: 'note-types.json'
};

const tfiles = {
  usergroups: 'groups.tsv'
};

const ffiles = {
  users: 'z303-fields.txt',
  local: 'z305-fields.txt',
  addrs: 'z304-fields.txt',
  ids: 'z308-fields.txt'
}

const fieldMap = (fmap, record) => {
  let f = {};
  for (let k in fmap) {
    let v = fmap[k];
    let d = record.substring(v[0], v[1]).trim();
    f[k] = d;
  }
  return f;
}

const writeJSON = (fn, data) => {
  const out = JSON.stringify(data) + "\n";
  fs.writeFileSync(fn, out, { flag: 'a' });
}

try {
  if (!usersDir) {
    throw new Error('Usage: $ node pmaUsers.js <ref_dir> <users_dir>');
  }
  if (!fs.existsSync(usersDir)) {
    throw new Error('Can\'t find input file');
  }

  let begin = new Date().valueOf();
  let nowDate = new Date().toISOString().replace(/T.+/, '');

  usersDir = usersDir.replace(/\/$/, '');
  refDir = refDir.replace(/\/$/, '');

  for (let f in files) {
    let fullPath = usersDir + '/' + files[f];
    if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
    files[f] = fullPath;
  }
  // console.log(files); return;

  let refData = {};
  for (let prop in rfiles) {
    let rpath = refDir + '/' + rfiles[prop];
    let refObj = require(rpath);
    let arr = refObj[prop];
    refData[prop] = {}
    arr.forEach(e => {
      let key = e.addressType || e.group || e.name;
      let id = e.id;
      refData[prop][key] = id;
    });
  }
  // console.log(refData); return;

  const fmap = {};

  for (let ff in ffiles) {
    let file = etcDir + '/' + ffiles[ff];
    console.log(`Reading ${file}`);
    let fields = fs.readFileSync(file, { encoding: 'utf8' });
    let cstart = 0;
    fmap[ff] = {};
    fields.split(/\n/).forEach(f => {
      let d = f.match(/^.+?-(.+) PICTURE.*\((\d+).+/);
      if (d) {
        let k = d[1];
        let v = d[2]
        v = parseInt(v, 10);
        k = k.replace(/\W/g, '_');
        let cend = cstart + v;
        fmap[ff][k] = [ cstart, cend, v ];
        cstart = cend;
      }
    });
  }
  // console.log(fmap); return;

  const tmap = {};
  for (let prop in tfiles) {
    let tpath = refDir + '/' + tfiles[prop];
    let tdata = fs.readFileSync(tpath, { encoding: 'utf8'});
    let arr = tdata.split(/\n/);
    arr.shift();
    tmap[prop] = {}
    arr.forEach(e => {
      let c = e.split(/\t/);
      let key = c[0];
      let val = c[1] || 'unspecified';
      tmap[prop][key] = (refData[prop]) ? refData[prop][val] : val;
    });
  }
  // console.log(tmap); return;

  // map addresses and ids
  let addMap = {};
  let idsMap = {};
  let locMap = {};
  const getAddsIds = () => {
    let linkedFile = usersDir + '/' + inFiles.addrs;
    let fileStream = fs.createReadStream(linkedFile);
    let rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });
    rl.on('line', r => {
      let j = fieldMap(fmap.addrs, r);
      if (!addMap[j.ID]) addMap[j.ID] = []
      addMap[j.ID].push(j);
    });
    rl.on('close', r => {
      let linkedFile = usersDir + '/' + inFiles.local;
      let fileStream = fs.createReadStream(linkedFile);
      let rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });
      rl.on('line', r => {
        let j = fieldMap(fmap.local, r);
        if (!locMap[j.ID]) locMap[j.ID] = [];
        locMap[j.ID].push(j);
      });
      rl.on('close', r => {
        // console.log(locMap);
        let linkedFile = usersDir + '/' + inFiles.ids;
        let fileStream = fs.createReadStream(linkedFile);
        let rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });
        rl.on('line', r => {
          let j = fieldMap(fmap.ids, r);
          if (!idsMap[j.ID]) idsMap[j.ID] = [];
          idsMap[j.ID].push(j);
        });
        rl.on('close', r => {
          main();
        });
      });
    });
  }

  bseen = {};
  hseen = {};
  bcused = {};

  const main = () => {
    let userFile = usersDir + '/' + inFiles.users;
    fileStream = fs.createReadStream(userFile);
    rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });

    let total = 0;
    let urc = 0;
    let irc = 0;
    let erc = 0;
    rl.on('line', r => {
      total++;
      let err = '';
      let j = fieldMap(fmap.users, r);
      let id = j.ID;
      let loc = (locMap[id]) ? locMap[id][0] : '';
      let a = (addMap[id]) ? addMap[id][0] : '';
      let ids = idsMap[id] || [];
      let bstatus = (loc) ? loc.BOR_STATUS.replace(/^0*/, '') : '';
      let expiry = (loc) ? loc.EXPIRY_DATE.replace(/(....)(..)(..)/, '$1-$2-$3') : '';
      let email = (a) ? a.EMAIL_ADDRESS : '';
      let phone = (a) ? a.TELEPHONE : '';
      let odate = (j.OPEN_DATE) ? j.OPEN_DATE.replace(/(....)(..)(..)/, '$1-$2-$3') : '';
      let bc = '';
      ids.forEach(i => {
        if (i.KEY_TYPE === '01') bc = i.KEY_DATA;
      });
      let user = {
        id: uuid(id, ns),
        username: id,
        active: false,
        personal: {}
      }
      // console.log(loc);
      user.patronGroup = (bstatus) ? tmap.usergroups[bstatus] : 'ERR';
      if (expiry) {
        user.expirationDate = expiry;
        user.active = (expiry > nowDate) ? true : false;
      }
      if (odate) {
        user.enrollmentDate = odate;
      }
      if (user.patronGroup === 'ERR') err = `No patron group found for "${bstatus}"`;
      if (bc) user.barcode = bc;
      if (j.NAME) {
        let [last, first] = j.NAME.split(/, */);
        if (!first) first = '';
        user.personal.lastName = last;
        let f = first.match(/(.+) (.*)$/);
        if (f && f[1]) first = f[1];
        user.personal.firstName = first;
        if (f && f[2]) user.personal.middleName = f[2];
        user.personal.preferredFirstName = first;
        if (email) { 
          user.personal.email = email;
          user.personal.preferredContactTypeId = '002';
        }
        if (phone) user.personal.phone = phone;
        if (a && a.ADDRESS2) {
          user.personal.addresses = [];
          let ad = {
            countryId: 'US',
            addressLine1: a.ADDRESS2,
          }
          if (a.ADDRESS3) {
            let cs = a.ADDRESS3.match(/(.+), ([A-Z]{2})$/);
            if (cs) {
              ad.city = cs[1];
              ad.region = cs[2];
            } else {
              ad.addressLine2 = a.ADDRESS3;
              if (a.ADDRESS4) {
                let cs = a.ADDRESS4.match(/(.+), ([A-Z]{2})$/);
                if (cs) {
                  ad.city = cs[1];
                  ad.region = cs[2];
                } else {
                  ad.city = a.ADDRESS4;
                  if (a.ADDRESS5 && !ad.region) {
                    ad.region = a.ADDRESS5;
                  }
                }
              }
            }
          } 
          if (a.ZIP) ad.postalCode = a.ZIP;
          ad.addressTypeId = refData.addressTypes['Home'];
          ad.primaryAddress = true;
          user.personal.addresses.push(ad);
        }
        
      }
      if (err) {
        console.log(`ERROR [${id}] ${err}`);
        let errObj = {
          gobal: j,
          local: locMap[id],
          addresses: addMap[id],
          ids: ids
        }
        writeJSON(files.err, errObj);
        erc++;
      } else {
        writeJSON(files.users, user);
        let perm = {
          id: uuid(user.id, ns),
          userId: user.id
        }
        writeJSON(files.perms, perm);
        urc++;
      }
      if (process.env.DEBUG) console.log(user);
    });
    rl.on('close', () => {
      let end = new Date().valueOf()
      let tt = (end - begin)/1000;
      console.log('Done!');
      console.log('Lines processed:', total);
      console.log('Users:', urc);
      console.log('Errors:', erc);
      console.log('Total time (secs):', tt);
    });
  }

  getAddsIds();

} catch (e) {
  console.error(e.message);
}
