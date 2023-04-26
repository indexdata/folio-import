const fs = require('fs');
const path = require('path');
const readline = require('readline');

const spFile = process.argv[2];
const usersFile = process.argv[3];
const itemFile = process.argv[4];

(async () => {
  try {
    if (itemFile === undefined) {
      throw('Usage: node cubCheckouts.js <service_points_file> <users_file> <sierra_items_file>');
    }
    if (!fs.existsSync(itemFile)) {
      throw new Error('Can\'t find loans file');
    }
    if (!fs.existsSync(spFile)) {
      throw new Error('Can\'t find service points file');
    }
    if (!fs.existsSync(usersFile)) {
      throw new Error('Can\'t find users file');
    }

    let dateOffset = (dt) => {
      let dzo = new Date(dt).getTimezoneOffset();
      let pto = ((dzo + 120) / 60);  // change this value according to the local machine that runs the script.
      out = `-0${pto}:00`;
      return out;
    }

    const write = (file, obj) => {
      fs.writeFileSync(file, JSON.stringify(obj) + '\n', { flag: 'a' });
    };

    const files = {
      co: 'checkouts.jsonl',
      ia: 'inactive_users.jsonl',
      nf: 'notfound_checkouts.jsonl'
    };

    let workDir = path.dirname(itemFile);
    for (let f in files) {
      files[f] = workDir + '/' + files[f];
      if (fs.existsSync(files[f])) {
        fs.unlinkSync(files[f]);
      }
    }

    const start = new Date().valueOf();
    const sp = require(spFile);
    spMap = {};
    sp.servicepoints.forEach(s => {
      spMap[s.code] = s.id;
    });

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
        pr: 0
      }

      rl.on('line', l => {
        let i = JSON.parse(l);
        let ff = i.fixedFields;
        let pnum = (ff && ff['66']) ? ff['66'].value : '';
        if (pnum && pnum !== '0') {
          let user = active[pnum];
          if (!user) throw(`User not found for ${pnum}`);
          let ubcode = user.barcode;
          let odate = (ff['63']) ? ff['63'].value : '';
          let due = (ff['65']) ? ff['65'].value : '';
          let loc = (ff['64']) ? ff['64'].value : '';
          let rnum = (ff['71']) ? ff['71'].value : '';
          let vf = i.varFields || [];
          let ibcode = '';
          vf.forEach(v => {
            if (v.fieldTag === 'b') {
              if (v.content.match(/^U/)) {
                ibcode = v.content;
              } else if (!ibcode) {
                ibcode = v.content
              }
            }
          });
          let loan = {};
          loan.itemBarcode = ibcode.trim();
          loan.userBarcode = ubcode.trim();
          loan.loanDate = odate;
          loan.dueDate = due;
          if (rnum) loan.renewalCount = parseInt(rnum, 10);
          loan.servicePointId = spMap.NORED;
          if (process.env.DEBUG) console.log(loan);
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
          if (ttl.co === 10) rl.close();
        }
      });
      rl.on('close', () => {
        const end = new Date().valueOf();
        const time = (end - start) / 1000;
        console.log('Checkouts:', ttl.co);
        console.log('Inactives:', ttl.ia);
        console.log('Proxy COs:', ttl.pr);
        console.log('Not found:', ttl.nf);
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
      let exDate = (u.fixedFields['43']) ? u.fixedFields['43'].value : '';
      let bc = '';
      u.varFields.forEach(v => {
        if (v.fieldTag === 'b' && !bc) bc = v.content;
      });
      active[u.id] = { active: true, expirationDate: exDate, barcode: bc };
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
