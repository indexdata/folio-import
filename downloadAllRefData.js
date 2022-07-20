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

    let mdUrls = [
      'https://raw.githubusercontent.com/folio-org/mod-configuration/master/descriptors/ModuleDescriptor-template.json',
      'https://raw.githubusercontent.com/folio-org/mod-inventory-storage/master/descriptors/ModuleDescriptor-template.json',
      'https://raw.githubusercontent.com/folio-org/mod-circulation-storage/master/descriptors/ModuleDescriptor-template.json',
      'https://raw.githubusercontent.com/folio-org/mod-users/master/descriptors/ModuleDescriptor-template.json',
      'https://raw.githubusercontent.com/folio-org/mod-permissions/master/descriptors/ModuleDescriptor-template.json',
      'https://raw.githubusercontent.com/folio-org/mod-tags/master/descriptors/ModuleDescriptor-template.json',
      'https://raw.githubusercontent.com/folio-org/mod-notes/master/descriptors/ModuleDescriptor-template.json',
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
      'https://raw.githubusercontent.com/folio-org/mod-data-import-converter-storage/master/descriptors/ModuleDescriptor-template.json',
      'https://raw.githubusercontent.com/folio-org/mod-custom-fields/master/descriptors/ModuleDescriptor-template.json',
      'https://raw.githubusercontent.com/folio-org/mod-licenses/master/service/src/main/okapi/ModuleDescriptor-template.json',
      'https://raw.githubusercontent.com/folio-org/mod-patron-blocks/master/descriptors/ModuleDescriptor-template.json',
      'https://raw.githubusercontent.com/folio-org/mod-source-record-manager/3451d3059baefb07bc822574552e5bde58ffae71/descriptors/ModuleDescriptor-template.json',
      'https://raw.githubusercontent.com/folio-org/mod-remote-storage/master/descriptors/ModuleDescriptor-template.json',
      'https://raw.githubusercontent.com/folio-org/folio-custom-fields/master/descriptors/ModuleDescriptor-template.json'
    ];

    const skipList = {
      '/item-storage/items': true,
      '/inventory-view/instances': true,
      '/holdings-storage/holdings': true,
      '/instance-storage/instances': true,
      '/instance-bulk/ids': true,
      '/preceding-succeeding-titles': true,
      '/shelf-locations': true,
      '/users': true,
      '/proxiesfor': true,
      '/patron-action-session-storage/expired-session-patron-ids': true,
      '/notes': true,
      '/notify': true,
      '/inventory-hierarchy/updated-instance-ids': true,
      '/loan-storage/loans': true,
      '/loan-storage/loan-history': true,
      '/oai-pmh-view/instances': true,
      '/oai-pmh-view/updatedInstanceIds': true,
      '/orders-storage/order-lines' : true,
      '/orders-storage/orders' : true,
      '/orders-storage/po-lines' : true,
      '/orders-storage/purchase-orders' : true,
      '/orders-storage/receiving-history' : true,
      '/request-storage/requests': true,
      '/patron-action-session-storage/patron-action-sessions': true,
      '/source-storage/records': true,
      '/source-storage/source-records': true,
      '/source-storage/sourceRecords': true,
      '/source-storage/snapshots': true,
      '/check-in-storage/check-ins': true,
      '/scheduled-notice-storage/scheduled-notices': true,
      '/accounts': true,
      '/feefineactions': true,
      '/metadata-provider/logs': true,
      '/change-manager/parsedRecords': true,
      '/source-storage/stream/records': true,
      '/source-storage/stream/source-records': true,
      '/organizations-storage/interfaces': true,
      '/coursereserves/reserves': true,
      '/coursereserves/courses': true,
      '/coursereserves/courselistings': true,
      '/record-bulk/ids': true,
      '/inventory-storage/bound-with-parts': true,
      '/request-preference-storage/request-preference': true,
      '/finance-storage/transactions': true
    }

    priority = [
      'location-units__institutions',
      'location-units__campuses',
      'location-units__libraries',
      'locations'
    ]

    let userMod = '';
    try {
      console.log('Getting modules list...');
      let res = await superagent
        .get(`${config.okapi}/_/proxy/tenants/${config.tenant}/modules`)
        .set('x-okapi-token', authToken);
        for (let x = 0; x < res.body.length; x++) {
          let m = res.body[x];
          if (m.id.match(/mod-users-\d/)) userMod = m.id;
        };
    } catch (e) {
      console.log(e);
    }
    
    let paths = [];

    for (let z = 0; z < mdUrls.length; z++) {
      let url = mdUrls[z];
      try {
        let res = await superagent.get(url);
        let md = JSON.parse(res.text);
        let name = md.name.replace(/ +/g, '_');
	      if (url.match(/mod-licenses/)) name = 'licenses'; // for some reason, mod-licenses doesn't have a name
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
      let saveDir = paths[x].mod.toLowerCase();
      paths[x].path = paths[x].path.replace(/\*/g, '');
      let fileName = paths[x].path.replace(/\//g, '__');
      if (!paths[x].path.match(/profileAssociations/)) fileName = fileName.replace(/\?.+$/, '');
      fileName = fileName.replace(/&/g, '%26');
      fileName = fileName.replace(/\?/g, '%3F');
      fileName = fileName.replace(/=/g, '%3D');
      console.log(`Fetching ${paths[x].path}...`);
      let url = `${config.okapi}/${paths[x].path}`;
      if (url.match(/\/permissions/)) {
        url += '?length=5000';
      } else if (url.match(/\/licenses\//)) {
        url += '?perPage=5000';
      } else if (!url.match(/\?/)) {
        url += '?limit=2000';
      } 
      if (url.match(/data-import-profiles/)) {
        url += '&withRelations=true';
      }
      if (paths[x].path == 'data-import-profiles/profileAssociations') {
	  let profTypes = [
		'ACTION_PROFILE_TO_ACTION_PROFILE',
		'ACTION_PROFILE_TO_MAPPING_PROFILE',
		'ACTION_PROFILE_TO_MATCH_PROFILE',
		'JOB_PROFILE_TO_ACTION_PROFILE',
		'JOB_PROFILE_TO_MATCH_PROFILE',
		'MATCH_PROFILE_TO_ACTION_PROFILE',
		'MATCH_PROFILE_TO_MATCH_PROFILE'
          ];
	  profTypes.forEach(p => {
	    let t = p.split(/_TO_/);
	    paths.push({ path: `${paths[x].path}?master=${t[0]}&detail=${t[1]}`, mod: paths[x].mod });
	  });
      }
      try {
        let res = {};
        if (url.match(/custom-fields/)) {
          res = await superagent
            .get(url)
            .timeout({ response: 5000 })
            .set('accept', 'application/json')
            .set('x-okapi-token', authToken)
            .set('x-okapi-module-id', userMod);
        } else {
          res = await superagent
            .get(url)
            .timeout({response: 5000})
            .set('accept', 'application/json')
            .set('x-okapi-token', authToken)
        }
        let jsonStr = JSON.stringify(res.body, null, 2);
        let fullSaveDir = refDir + saveDir;
        if (!fs.existsSync(fullSaveDir)) {
          console.log(`Creating directory: ${saveDir}`);
          fs.mkdirSync(fullSaveDir);
        }
        let p = priority.indexOf(fileName);
        if (p > -1) {
          fileName = `${p}-${fileName}`;
        }
        fs.writeFileSync(`${fullSaveDir}/${fileName}.json`, jsonStr);
        if (paths[x].path == 'service-points') {
          res.body.servicepoints.forEach(sp => {
            paths.push({ path: `calendar/periods/${sp.id}/period?withOpeningDays=true&showPast=true&showExceptional=false`, mod: paths[x].mod });
          }) 
        }
        if (paths[x].path == 'organizations-storage/interfaces') {
          res.body.interfaces.forEach(r => {
            paths.push({ path: `${paths[x].path}/${r.id}/credentials`, mod: paths[x].mod });
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
