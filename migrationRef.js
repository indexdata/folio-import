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
        authority-note-types authority-source-files mapping-rules/marc-bib mapping-rules/marc-authority 
        subject-sources subject-types instance-date-types`,
  acq: `acquisitions-units/units locations material-types batch-group-storage/batch-groups orders/acquisition-methods
        finance/expense-classes organizations-storage/categories organizations-storage/contacts organizations-storage/organizations
        organizations-storage/interfaces organizations-storage/organization-types note-types finance-storage/funds
        orders-storage/order-templates identifier-types custom-fields`,
  fin: `acquisitions-units/units finance-storage/expense-classes finance-storage/funds finance-storage/fund-types
        finance-storage/fiscal-years finance-storage/ledgers finance-storage/budget-expense-classes
        finance-storage/groups finance-storage/group-fund-fiscal-years`,
  usr: `groups addresstypes departments custom-fields note-types service-points manual-block-templates`,
  fee: `owners feefines`,
  erm: `erm/custprops erm/refdata organizations-storage/organizations acquisitions-units/units note-types`, 
  lic: `licenses/custprops licenses/refdata organizations-storage/organizations acquisitions-units/units`,
  crs: `coursereserves/departments coursereserves/coursetypes coursereserves/terms coursereserves/processingstatuses
        coursereserves/copyrightstatuses locations service-points`
};

let limit = 5000;
let modId = '';

(async () => {
  try {
    if (!refDir) throw(`Usage node migrationRef.js <refDir> [ <inv|acq|fin|usr|fee|erm|lic|crs> ]`);

    const config = await getAuthToken(superagent);

    const get = async (ep, modId) => {
      let lim = (ep.match(/authority/)) ? 1000 : limit;
      url = `${config.okapi}/${ep}?limit=${lim}`;
      if (ep.match(/^(erm|licenses)\//)) url = `${config.okapi}/${ep}?max=100`;
      console.warn('GET', url);
      try {
        let h = 'dummy';
        let v = 'dummy';
        if (modId) {
          h = 'x-okapi-module-id';
          v = modId;
        }
        const res = await superagent
        .get(url)
        .set('User-Agent', config.agent)
        .set('cookie', config.cookie)
        .set('x-okapi-tenant', config.tenant)
        .set('x-okapi-token', config.token)
        .set('accept', 'application/json')
        .set(h, v);
        return (res.body);
      } catch (e) {
        console.log(`${e}`);
      }
    }

    refDir = refDir.replace(/\/$/, '');

    let mods = await get(`_/proxy/tenants/${config.tenant}/modules`);
    let modVer = {}
    mods.forEach(m => {
      if (m.id.match(/mod-users-\d/)) {
        modVer.usr = m.id;
      } else if (m.id.match(/mod-orders-storage/)) {
        modVer.acq = m.id;
      }
    });
    
    if (mtype) {
      let val = paths[mtype];
      if (!val) throw(`No module found for ${mtype}!  Valid choices: inv, acq, fin, usr, fee, erm, lic.`);
      paths = {};
      paths[mtype] = val;
    }
    for (let t in paths) {
      let path = paths[t];
      path = path.replace(/\n/g, ' ');
      
      let eps = path.split(/ +/);
      for (let x = 0; x < eps.length; x++) {
        let ep = eps[x];
        let mver = '';
        if (ep === 'custom-fields') {
          mver = modVer[t];
        }
        let tdir = `${refDir}/${t}`;
        if (!fs.existsSync(tdir)) { 
          console.log('INFO Making directory:', tdir);
          fs.mkdirSync(tdir, { recursive: true });
        }
        let name = ep.replace(/^.+\//, '');
        let fn = `${tdir}/${name}.json`;
        let res = await get(ep, mver);
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
