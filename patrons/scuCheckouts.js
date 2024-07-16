const fs = require('fs');
const path = require('path');
const readline = require('readline');

let refDir = process.argv[2];
const usersFile = process.argv[3];
const itemFile = process.argv[4];

const refFiles = {
  servicepoints: 'service-points.json',
  locmap: 'locations.tsv',
  outmap: 'outlocs.tsv',
};

(async () => {
  try {
    if (itemFile === undefined) {
      throw('Usage: node scuCheckouts.js <inventory_ref_dir> <folio_users_file> <sierra_items_file>');
    }
    if (!fs.existsSync(itemFile)) {
      throw new Error('Can\'t find loans file');
    }
    if (!fs.existsSync(refDir)) {
      throw new Error('Can\'t find service points file');
    }
    if (!fs.existsSync(usersFile)) {
      throw new Error('Can\'t find users file');
    }
    refDir = refDir.replace(/\/$/, '');

    let dateOffset = (dt) => {
      let dzo = new Date(dt).getTimezoneOffset();
      let pto = ((dzo + 120) / 60);  // change this value according to the local machine that runs the script.
      let out = `-0${pto}:00`;
      return out;
    }

    const write = (file, obj) => {
      fs.writeFileSync(file, JSON.stringify(obj) + '\n', { flag: 'a' });
    };

    const files = {
      co: 'checkouts.jsonl',
      ia: 'inactive_users.jsonl',
      nf: 'notfound_checkouts.jsonl',
      nb: 'no_user_barcode.jsonl'
    };

    let workDir = path.dirname(itemFile);
    for (let f in files) {
      files[f] = workDir + '/' + files[f];
      if (fs.existsSync(files[f])) {
        fs.unlinkSync(files[f]);
      }
    }

    const start = new Date().valueOf();
    const spFile = refDir + '/' + refFiles.servicepoints;
    const sp = require(spFile);
    spMap = {};
    sp.servicepoints.forEach(s => {
      spMap[s.code] = s.id;
    });
    // console.log(spMap); return;

    const locs = fs.readFileSync(refDir + '/' + refFiles.locmap, { encoding: 'utf8'} );
    const loc2sp = {};
    locs.split(/\r?\n/).forEach(l => {
      let cols = l.split(/\t/);
      let k = cols[0];
      let spk = cols[5];
      loc2sp[k] = spMap[spk];
    });
    // console.log(loc2sp); return;

    const outs = fs.readFileSync(refDir + '/' + refFiles.outmap, { encoding: 'utf8'} );
    const out2sp = {};
    outs.split(/\r?\n/).forEach(l => {
      let cols = l.split(/\t/);
      let k = cols[0];
      spk = cols[1];
      if (k.match(/^\d+$/)) out2sp[k] = spMap[spk];
    });
    // console.log(out2sp); return;

    const main = () => {
      const fileStream = fs.createReadStream(itemFile);
      const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
      });

      const ttl = {
        co: 0,
        ia: 0,
        nf: 0,
        pr: 0,
        nb: 0
      }
      let c = 0;

      rl.on('line', l => {
        c++;
        let i = JSON.parse(l);
        let ff = i.fixedFields;
        let pnum = (ff && ff['66']) ? ff['66'].value : '';
        if (pnum && pnum !== '0') {
          let user = active[pnum];
          if (!user) { 
            console.log(`User not found for ${pnum}`);
          } else {
            let ubcode = user.barcode;
            let odate = (ff['63']) ? ff['63'].value : '';
            let due = (ff['65']) ? ff['65'].value : '';
            let outloc = (ff['64']) ? ff['64'].value : '';
            let loc = (ff['79']) ? ff['79'].value : '';
            let rnum = (ff['71']) ? ff['71'].value : '';
            let vf = i.varFields || [];
            let ibcode = '';
            vf.forEach(v => {
              if (v.fieldTag === 'b') {
                ibcode = v.content
              }
            });
            let loan = {};
            loan.itemBarcode = ibcode.trim();
            loan.userBarcode = ubcode.trim();
            loan.loanDate = odate;
            loan.dueDate = due;
            if (rnum) loan.renewalCount = parseInt(rnum, 10);
            loan.servicePointId = out2sp[outloc] || loc2sp[loc] || spMap.ulhelpdesk;
            if (process.env.DEBUG) console.log(loan);
            if (user) {
              if (loan.userBarcode) {
                write(files.co, loan);
                if (!user.active) {
                  user.barcode = loan.userBarcode;
                  write(files.ia, user);
                  ttl.ia++;
                }
                ttl.co++;
              } else {
                loan.pnumber = 'p' + pnum;
                write(files.nb, loan);
                ttl.nb++;
              }
            } else {
              write(files.nf, loan);
              ttl.nf++;
            }
            
            // if (ttl.co === 10) rl.close();
          }
        }
        if (c % 100000 === 0) {
          console.log('Items processed', c);
        }
      });
      rl.on('close', () => {
        const end = new Date().valueOf();
        const time = (end - start) / 1000;
        console.log('Checkouts:', ttl.co);
        console.log('Inactives:', ttl.ia);
        console.log('Proxy COs:', ttl.pr);
        console.log('Not found:', ttl.nf);
        console.log('No userBc:', ttl.nb);
        console.log('Time (sec):', time);
      });
    } 
    
    const ufileStream = fs.createReadStream(usersFile);
    const url = readline.createInterface({
      input: ufileStream,
      crlfDelay: Infinity
    });

    console.log('Loading users into memory...')

    let active = {};
    let ucount = 0;
    url.on('line', l => {
      let u = JSON.parse(l);
      let pid = (u.customFields) ? u.customFields.sierraPatronRecordNumber : '';
      pid = pid.replace(/^p/, '');
      // let exDate = (u.fixedFields['43']) ? u.fixedFields['43'].value : '';
      let exDate = u.expirationDate;
      // let exDateVal = (exDate) ? new Date(exDate).valueOf() : 0;
      // let act = (start > exDateVal) ? false : true;
      let act = u.active;
      let bc = u.barcode || '';
      /* 
      let bc = '';
      u.varFields.forEach(v => {
        if (v.fieldTag === 'b' && !bc) bc = v.content;
      });
      */

      active[pid] = { active: act, expirationDate: exDate, barcode: bc };
      ucount++;
    });
    url.on('close', l=> {
      console.log(`(${ucount} users loaded...)`);
      main();
    });
  } catch (e) {
    console.error(e);
  }
})();
