const fs = require('fs');
const superagent = require('superagent');
const { getAuthToken } = require('./lib/login');
let refDir = process.argv[2];

(async () => {
  try {
    if (!refDir) {
      throw new Error('Usage: node downloadAllRefData.js <reference_dir>');
    } else if (!fs.existsSync(refDir)) {
      throw new Error('Reference directory does\'t exist!');
    } else if (!fs.lstatSync(refDir).isDirectory()) {
      throw new Error(`${refDir} is not a directory!`)
    }
    const config = (fs.existsSync('./config.js')) ? require('./config.js') : require('./config.default.js');

    const authToken = await getAuthToken(superagent, config.okapi, config.tenant, config.authpath, config.username, config.password);

    const mdUrls = [
      'https://raw.githubusercontent.com/folio-org/mod-configuration/master/descriptors/ModuleDescriptor-template.json',
      'https://raw.githubusercontent.com/folio-org/mod-inventory-storage/master/descriptors/ModuleDescriptor-template.json',
      'https://raw.githubusercontent.com/folio-org/mod-circulation-storage/master/descriptors/ModuleDescriptor-template.json',
      'https://raw.githubusercontent.com/folio-org/mod-users/master/descriptors/ModuleDescriptor-template.json',
      'https://raw.githubusercontent.com/folio-org/mod-permissions/master/descriptors/ModuleDescriptor-template.json',
      'https://raw.githubusercontent.com/folio-org/mod-tags/master/descriptors/ModuleDescriptor-template.json',
      'https://raw.githubusercontent.com/folio-org/mod-notes/master/descriptors/ModuleDescriptor-template.json',
      'https://raw.githubusercontent.com/folio-org/mod-calendar/master/descriptors/ModuleDescriptor-template.json',
      'https://raw.githubusercontent.com/folio-org/mod-finance-storage/master/descriptors/ModuleDescriptor-template.json',
      'https://raw.githubusercontent.com/folio-org/mod-organizations-storage/master/descriptors/ModuleDescriptor-template.json',
      'https://raw.githubusercontent.com/folio-org/mod-orders-storage/master/descriptors/ModuleDescriptor-template.json',
      'https://raw.githubusercontent.com/folio-org/mod-invoice-storage/master/descriptors/ModuleDescriptor-template.json',
      'https://raw.githubusercontent.com/folio-org/mod-notify/master/descriptors/ModuleDescriptor-template.json',
      'https://raw.githubusercontent.com/folio-org/mod-feesfines/master/descriptors/ModuleDescriptor-template.json',
      'https://raw.githubusercontent.com/folio-org/mod-email/master/descriptors/ModuleDescriptor-template.json',
      'https://raw.githubusercontent.com/folio-org/mod-template-engine/master/descriptors/ModuleDescriptor-template.json',
      'https://raw.githubusercontent.com/folio-org/mod-login-saml/master/descriptors/ModuleDescriptor-template.json',
      'https://raw.githubusercontent.com/folio-org/mod-data-import/master/descriptors/ModuleDescriptor-template.json',
      'https://raw.githubusercontent.com/folio-org/mod-source-record-storage/master/descriptors/ModuleDescriptor-template.json',
      'https://raw.githubusercontent.com/folio-org/mod-courses/master/descriptors/ModuleDescriptor-template.json',
      'https://raw.githubusercontent.com/folio-org/mod-custom-fields/master/descriptors/ModuleDescriptor-template.json'
    ]

    const skipList = {
      '/item-storage/items': true,
      '/holdings-storage/holdings': true,
      '/instance-storage/instances': true,
      '/users': true,
      '/proxiesfor': true,
      '/notes': true,
      '/notify': true,
      '/loan-storage/loans': true,
      '/loan-storage/loan-history': true,
      '/request-storage/requests': true,
      '/patron-action-session-storage/patron-action-sessions': true,
      '/source-storage/records': true,
      '/source-storage/sourceRecords': true
    }
    
    let paths = [];

    for (let z = 0; z < mdUrls.length; z++) {
      let url = mdUrls[z];
      try {
        let res = await superagent.get(url);
        let md = JSON.parse(res.text);
        let name = md.name.replace(/ +/g, '_');
        let prov = md.provides;
        for (let x = 0; x < prov.length; x++) {
          let hand = prov[x].handlers;
          for (let y = 0; y < hand.length; y++) {
            let method = hand[y].methods[0];
            let pp = hand[y].pathPattern;
            if (method === 'GET' && !pp.match(/\{|^\/_/)) {
              if (skipList[pp]) {
                console.log(`Skipping ${pp}`);
              } else {
                pp = pp.replace(/^\//, '');
                paths.push({ mod: name, path: pp });
              }
            }
          }
        }
      } catch (e) {
        console.error(e.message);
      }
    }

    for (let x = 0; x < paths.length; x++) {
      paths[x].path = paths[x].path.replace(/\*/g, '');
      let fileName = paths[x].path.replace(/\//g, '%2F');
      fileName = fileName.replace(/\?.+$/, '');
      console.log(`Fetching ${paths[x].path}...`);
      let url = `${config.okapi}/${paths[x].path}`;
      if (url.match(/\/permissions/)) {
        url += '?length=5000'
      } else if (!url.match(/\?/)) {
        url += '?limit=2000';
      } 
      try {
        let res = await superagent
          .get(url)
          .timeout({response: 5000})
          .set('accept', 'application/json')
          .set('x-okapi-token', authToken);
        let jsonStr = JSON.stringify(res.body, null, 2);
        fs.writeFileSync(`${refDir}/${paths[x].mod}:${fileName}.json`, jsonStr);
        if (paths[x].path == 'service-points') {
          res.body.servicepoints.forEach(sp => {
            paths.push({ path: `calendar/periods/${sp.id}/period?withOpeningDays=true&showPast=true&showExceptional=false`, mod: 'Calendar_module' });
          }) 
        }
      } catch (e) {
        try {
          console.log(e.response.text);
        } catch {
          console.log(e.message);
        }
      }
    }
  } catch (e) {
    console.error(e.message);
  }
})();
