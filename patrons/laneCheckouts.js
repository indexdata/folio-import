const fs = require('fs');
const path = require('path');
const parse = require('csv-parse/lib/sync');
const readline = require('readline');

const spFile = process.argv[2];
const usersFile = process.argv[3];
const csvFile = process.argv[4];

(async () => {
  try {
    if (csvFile === undefined) {
      throw('Usage: node laneCheckouts.js <service_points_file> <users_file> <loans_csv_file>');
    }
    if (!fs.existsSync(csvFile)) {
      throw new Error('Can\'t find loans file');
    }
    if (!fs.existsSync(spFile)) {
      throw new Error('Can\'t find service points file');
    }
    if (!fs.existsSync(usersFile)) {
      throw new Error('Can\'t find users file');
    }

    const start = new Date().valueOf();
    const sp = require(spFile);
    spMap = {};
    sp.servicepoints.forEach(s => {
      spMap[s.code] = s.id;
    });

    const fileStream = fs.createReadStream(csvFile);
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });

    let csv = '';
    let lcount = 0;
    let ccount = 0;
    for await (let line of rl) {
      lcount++;
      if (lcount === 1) {
        line = line.replace(/^\uFEFF/, ''); // remove BOM
        ccount = line.split(/,/).length;
      }
      let cols = line.split(/,/);
      if (cols.length < ccount) line += ','; 
      csv += line + '\n';
    }

    const inRecs = parse(csv, {
      columns: true,
      skip_empty_lines: true
    });
    
    console.log('Loading users into memory...')
    const users = require(usersFile);
    delete require.cache[require.resolve(usersFile)];

    let active = {};
    let ucount = 0;
    users.users.forEach(u => {
      active[u.barcode] = { active: u.active, expirationDate: u.expirationDate };
      ucount++;
    });
    console.log(`(${ucount} users loaded...)`);

    let dateOffset = (dt) => {
      let dzo = new Date(dt).getTimezoneOffset();
      let pto = ((dzo+120)/60);  // change this value according to the local machine that runs the script.
      out = `-0${pto}:00`;
      return out; 
    }

    const files = {
      co: 'checkouts.jsonl',
      ia: 'inactive_users.jsonl',
      nf: 'users_notfound_checkouts.jsonl'
    };

    let workDir = path.dirname(csvFile);
    for (let f in files) {
      files[f] = workDir + '/' + files[f];
      if (fs.existsSync(files[f])) {
        fs.unlinkSync(files[f]);
      }
    }

    const write = (file, obj) => {
      fs.writeFileSync(file, JSON.stringify(obj) + '\n', { flag: 'a'});
    };

    const records = {};
    const ttl = {
      co: 0,
      ia: 0,
      nf: 0,
      pr: 0
    }

    inRecs.forEach(r => {
      let loan = {};
      loan.itemBarcode = r['ITEM_BARCODE'].trim();
      loan.userBarcode = r['PATRON_BARCODE'].trim();
      let odate = r['CHARGE_DATE'].replace(/\.\d+$/, '');
      odate = odate.replace(/ /, 'T');
      let os = dateOffset(odate);
      loan.loanDate = odate + os;
      let ddate = r['CURRENT_DUE_DATE'].replace(/\.\d+$/, '');
      ddate = ddate.replace(/ /, 'T');
      os = dateOffset(ddate);
      loan.dueDate = ddate + os;
      loan.servicePointId = spMap['LANE-DESK'];
      let user = active[loan.userBarcode];
      if (user) {
        write(files.co, loan);
        ttl.co++;
        if (!user.active) {
          user.barcode = loan.userBarcode;
          write(files.ia, user);
          ttl.ia++;
        }
      } else {
        write(files.nf, loan);
        ttl.nf++;
      } 
    });

    const end = new Date().valueOf();
    const time = (end - start)/1000;
    console.log('Checkouts:', ttl.co);
    console.log('Inactives:', ttl.ia);
    console.log('Proxy COs:', ttl.pr);
    console.log('Not found:', ttl.nf);
    console.log('Time (sec):', time);
  } catch (e) {
    console.error(e);
  }
})();
