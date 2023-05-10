const fs = require('fs');
const path = require('path');
const readline = require('readline');

const loansFile = process.argv[2];

(async () => {
  try {
    if (loansFile === undefined) {
      throw('Usage: node culawCheckouts.js <loans_cvs_file>');
    }
    if (!fs.existsSync(loansFile)) {
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
      co: 'checkouts.jsonl',
    };

    let workDir = path.dirname(loansFile);
    for (let f in files) {
      files[f] = workDir + '/' + files[f];
      if (fs.existsSync(files[f])) {
        fs.unlinkSync(files[f]);
      }
    }

    const start = new Date().valueOf();

    const main = () => {
      const fileStream = fs.createReadStream(loansFile);
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
      let c = 0;

      rl.on('line', l => {
        c++;
        console.log(l);
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
        console.log('Time (sec):', time);
      });
    } 
    main();
  } catch (e) {
    console.error(e);
  }
})();
