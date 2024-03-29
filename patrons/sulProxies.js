const fs = require('fs');
const path = require('path');
const parse = require('csv-parse/lib/sync');
const readline = require('readline');
const uuid = require('uuid/v5');
const { listenerCount } = require('process');
const usersFile = process.argv[2];
const csvFile = process.argv[3];

const ns = 'e1e79732-379c-496d-992f-44ec7e28ef90';

(async () => {
  try {
    if (csvFile === undefined) {
      throw('Usage: node sulProxies.js <users_file> <proxies_csv_file>');
    }
    if (!fs.existsSync(csvFile)) {
      throw new Error('Can\'t find loans file');
    }
    if (!fs.existsSync(usersFile)) {
      throw new Error('Can\'t find users file');
    }

    let workDir = path.dirname(csvFile);

    const users = require(usersFile);
    delete require.cache[require.resolve(usersFile)];

    let bcmap = {};
    let uc = 0;
    console.log(`Loading users...`);
    users.users.forEach(u => {
      bcmap[u.barcode] = u.id;
      uc++;
    });
    console.log(`(${uc} user records read)`);

    let csv = fs.readFileSync(csvFile, { encoding: 'utf8'});
    csv = csv.replace(/^\uFEFF/, ''); // remove BOM

    const inRecs = parse(csv, {
      columns: true,
      skip_empty_lines: true
    });

    const files = {
      pf: 'proxiesfor.jsonl',
      inAct: 'inactive-proxiesfor.jsonl',
      nfp: 'notfound_proxy.jsonl',
      nfu: 'notfound_sponser.jsonl'
    };

    for (let k in files) {
      files[k] = `${workDir}/${files[k]}`;
      if (fs.existsSync(files[k])) fs.unlinkSync(files[k]);
    }

    const fileStream = fs.createReadStream(csvFile);
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });

    let total = 0;
    let succ = 0;
    let inActc = 0;
    let err = 0;
    const nowVal = new Date().valueOf();
    rl.on('line', l => {
      if (!l.match(/sponsorID/)) {
        let [ spon, prox, exp ] = l.split(',');
        let pid = bcmap[prox];
        let sid = bcmap[spon];
        exp = exp.replace(/(\d{4})(\d\d)(\d\d)/, '$1-$2-$3');
        let ed = new Date(exp);
        let expVal = ed.valueOf();
        let expStr = ed.toISOString();
        expStr = expStr.replace(/Z$/, '-08:00');
        if (pid && sid) {
          let id = uuid(pid + sid, ns);
          let pf = {
            id: id,
            proxyUserId: pid,
            userId: sid,
            accrueTo: 'Sponsor',
            notificationsTo: 'Sponsor',
            requestForSponsor: 'Yes',
            status: (expVal < nowVal) ? 'Inactive' : 'Active'
          };
          if (exp) pf.expirationDate = expStr;
          if (pf.status === 'Inactive') {
            let iout = JSON.stringify(pf) + "\n";
            fs.writeFileSync(files.inAct, iout, { flag: 'a'});
            pf.status = 'Active';
            pf.expirationDate = '2023-12-31T00:00:00.000-08:00'; 
          }
          let out = JSON.stringify(pf) + "\n";
          fs.writeFileSync(files.pf, out, { flag: 'a' });
          succ++;
        } else {
          fs.writeFileSync(files.nfp, l + '\n', { flag: 'a' });
          err++;
        }
        total++;
      }
    });
    rl.on('close', l => {
      console.log('Processed', total);
      console.log('Created', succ);
      console.log('NotFound', err);
    });

  } catch (e) {
    console.error(e);
  }
})();
