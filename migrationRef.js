const fs = require('fs');
const superagent = require('superagent');
const { getAuthToken } = require('./lib/login');
let refDir = process.argv[2];
let mtype = process.argv[3];

let paths = {
  inv: `contributor-name-types contributor-types alternative-title-types call-number-types 
        classification-types electronic-access-relationships holdings-note-types holdings-types holdings-sources
        identifier-types ill-policies instance-formats instance-note-types instance-relationship-types
        instance-statuses instance-types item-damaged-statuses item-note-types loan-types locations material-types
        modes-of-issuance nature-of-content-terms service-points statistical-code-types statistical-codes
        authority-note-types authority-source-files`,
  acq: `acquisitions-units/units locations material-types batch-group-storage/batch-groups orders/acquisition-methods
        finance/expense-classes organizations-storage/categories organizations-storage/contacts organizations-storage/organizations
        organizations-storage/interfaces organizations-storage/organization-types note-types`,
  fin: `expense-classes funds fund-types fiscal-years ledgers budget-expense-classes groups group-fund-fiscal-years`,
  usr: `groups addresstypes departments custom-fields note-types service-points`,
  fee: `owners feefines`,
  erm: `erm/custprops erm/refdata`, 
  lic: `licenses/custprops licenses/refdata`
};

(async () => {
  try {
    if (!refDir) throw(`Usage node migrationRef.js <refDir> [ <inv|acq|fin|usr|fee|erm> ]`);

    const config = await getAuthToken(superagent);

    const get = async (ep) => {
      url = `${config.okapi}/${ep}?limit=5000`;
      console.warn('GET', url);
      try {
        const res = await superagent
        .get(url)
        .set('x-okapi-token', config.token)
        .set('accept', 'application/json');
        return (res.body);
      } catch (e) {
        console.log(`${e}`);
      }
    }

    refDir = refDir.replace(/\/$/, '');
    
    if (mtype) {
      let val = paths[mtype];
      paths = {};
      paths[mtype] = val;
    }
    for (let t in paths) {
      let path = paths[t];
      path = path.replace(/\n/g, ' ');
      let eps = path.split(/ +/);
      for (let x = 0; x < eps.length; x++) {
        let ep = eps[x];
        let tdir = `${refDir}/${t}`;
        if (!fs.existsSync(tdir)) { 
          console.log('INFO Making directory:', tdir);
          fs.mkdirSync(tdir, { recursive: true });
        }
        let name = ep.replace(/^.+\//, '');
        let fn = `${tdir}/${name}.json`;
        let res = await get(ep);
        if (res) {
          let out = JSON.stringify(res, null, 2) + '\n';
          fs.writeFileSync(fn, out);
        }
      }
    }
    
  } catch(e) {
      console.log(`${e}`);
  }
})();
