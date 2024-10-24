const fs = require('fs');
const superagent = require('superagent');

const { getAuthToken } = require('./lib/login');
let inFile = process.argv[2];

const wait = (ms) => {
  console.log(`(Waiting ${ms}ms...)`);
  return new Promise((resolve) => setTimeout(resolve, ms));
};

(async () => {
  try {
    const start = new Date().valueOf();
    if (!inFile) {
      throw 'Usage: node loadErmRef.js <ref_data_file>';
    } else if (!fs.existsSync(inFile)) {
      throw new Error('Can\'t find input file');
    }
    let indata = fs.readFileSync(inFile, { encoding: 'utf8'});
    let rd = [];
    try {
      rd = JSON.parse(indata);
    } catch(e) {
      let recs = indata.split(/\n/);
      if (recs[recs.length-1] === '') recs.pop();
      recs.forEach(r => {
        let j = JSON.parse(r);
        rd.push(j);
      });
    }

    let config = await getAuthToken(superagent);

    let ep = 'erm/refdata';
    const url = `${config.okapi}/${ep}`;
    const getUrl = `${url}?max=100`;
    const nameMap = {};

    try {
      console.log(`GET ${getUrl}`);
      const res = await superagent
        .get(getUrl)
        .set('x-okapi-token', config.token)
        .set('accept', 'application/json');
      for (let y = 0; y < res.body.length; y++) {
        let o = res.body[y];
        nameMap[o.desc] = o.id;
      }
    } catch(e) {
      console.log(e);
    }

    let success = 0;
    let fail = 0;
    for (let x = 0; x < rd.length; x++) {
      let pl = rd[x];
      let d = pl.desc;
      if (!nameMap[d]) {
        try {
          console.log(`POST ${url}`);
          let res = await superagent
          .post(url)
          .send(pl)
          .set('x-okapi-token', config.token)
          .set('content-type', 'application/json')
          .set('accept', 'application/json');
          console.log(`Successfully added "${d}"`);
        } catch(e) {
          console.log(e);
        }
      } else {
        console.log(`"${d}" already exists...`);
      }
    
    }

    const end = new Date().valueOf();
    const ms = end - start;
    const time = Math.floor(ms / 1000);
  } catch (e) {
    console.error(e);
  }
})();
