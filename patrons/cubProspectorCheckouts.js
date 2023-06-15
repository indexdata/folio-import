const fs = require('fs');
const path = require('path');
const readline = require('readline');

const ubcode = 'PROSPECTORMC';

const usersFile = process.argv[2];
const itemFile = process.argv[3];

(async () => {
  try {
    if (itemFile === undefined) {
      throw('Usage: node cubProspectorCheckouts.js <sierra_users_file> <sierra_checkouts_file>');
    }
    if (!fs.existsSync(itemFile)) {
      throw new Error('Can\'t find loans file');
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
      co: 'pcheckouts.jsonl',
      vi: 'virtual-items.jsonl'
    };

    let workDir = path.dirname(itemFile);
    for (let f in files) {
      files[f] = workDir + '/' + files[f];
      if (fs.existsSync(files[f])) {
        fs.unlinkSync(files[f]);
      }
    }

    const start = new Date().valueOf();

    const main = () => {
      const fileStream = fs.createReadStream(itemFile);
      const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
      });

      const ttl = {
        co: 0,
        vi: 0,
        nf: 0,
        pr: 0
      }
      let c = 0;

      rl.on('line', l => {
        c++;
        let co = JSON.parse(l);
        let sid = co.id;
        let odate = co.outDate;
        let due = co.dueDate;
        let rnum = co.numberOfRenewals;
        let ibcode = co.barcode;
        let inum = co.item;
        let pnum = (co.patron) ? co.patron.replace(/^.+\//, '') : '';
        let loan = {};
        if (ibcode && (co.patron && co.patron.match(/@/)) || inum && inum.match(/@/)) {
          loan.itemBarcode = ibcode.trim();
          loan.userBarcode = ubcode;
          loan.loanDate = odate;
          loan.dueDate = due;
          if (rnum) loan.renewalCount = parseInt(rnum, 10);
          loan.servicePointId = '3a40852d-49fd-4df2-a1f9-6e2641a6e91f';
          if (process.env.DEBUG) console.log(loan);
          if (inum && inum.match(/@/)) {
            loan.userBarcode = (active[pnum]) ? active[pnum].barcode : '';
            write(files.vi, loan);
            ttl.vi++;
          } else {
            write(files.co, loan);
            ttl.co++;
          }
        } else {
          if (!ibcode) console.log(`No barcode found for ${sid}`);
          ttl.nf++;
        }
        if (c % 100000 === 0) {
          console.log('Checkouts processed', c);
        }
      });
      rl.on('close', () => {
        const end = new Date().valueOf();
        const time = (end - start) / 1000;
        console.log('Checkouts:', ttl.co);
        console.log('Virtual items:', ttl.vi);
        console.log('Skipped:', ttl.nf);
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
      let exDateVal = (exDate) ? new Date(exDate).valueOf() : 0;
      let act = (start > exDateVal) ? false : true;
      let bc = '';
      u.varFields.forEach(v => {
        if (v.fieldTag === 'b' && !bc) bc = v.content;
      });

      active[u.id] = { active: act, expirationDate: exDate, barcode: bc };
      ucount++;
    });
    url.on('close', l => {
      console.log(`(${ucount} users loaded...)`);
      main();
    });
    
    } catch (e) {
    console.error(e);
  }
})();
