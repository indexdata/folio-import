const fs = require('fs');
const superagent = require('superagent');
const { getAuthToken } = require('./lib/login');
let refDir = process.argv[2];
let modName = process.argv[3];

(async () => {
  try {
    if (!refDir) {
      throw new Error('Usage: node downloadAllRefData.js <reference_dir> <mod_name_regexp>');
    } else if (!fs.existsSync(refDir)) {
      throw new Error('Reference directory does\'t exist!');
    } else if (!fs.lstatSync(refDir).isDirectory()) {
      throw new Error(`${refDir} is not a directory!`)
    }
    refDir = refDir.replace(/\/$/, '');

    let startTime = new Date().valueOf();

    let config = await getAuthToken(superagent);
    let authToken = config.token;

    let mdUrls = [
      'https://raw.githubusercontent.com/folio-org/mod-configuration/master/descriptors/ModuleDescriptor-template.json',
      'https://raw.githubusercontent.com/folio-org/mod-inventory-storage/master/descriptors/ModuleDescriptor-template.json',
      'https://raw.githubusercontent.com/folio-org/mod-circulation-storage/master/descriptors/ModuleDescriptor-template.json',
      'https://raw.githubusercontent.com/folio-org/mod-patron-blocks/master/descriptors/ModuleDescriptor-template.json',
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
      'https://raw.githubusercontent.com/folio-org/mod-di-converter-storage/master/descriptors/ModuleDescriptor-template.json',
      'https://raw.githubusercontent.com/folio-org/mod-data-export/master/descriptors/ModuleDescriptor-template.json',
      'https://raw.githubusercontent.com/folio-org/mod-source-record-storage/master/descriptors/ModuleDescriptor-template.json',
      'https://raw.githubusercontent.com/folio-org/mod-source-record-manager/master/descriptors/ModuleDescriptor-template.json',
      'https://raw.githubusercontent.com/folio-org/mod-courses/master/descriptors/ModuleDescriptor-template.json',
      'https://raw.githubusercontent.com/folio-org/mod-custom-fields/master/descriptors/ModuleDescriptor-template.json',
      'https://raw.githubusercontent.com/folio-org/folio-custom-fields/master/descriptors/ModuleDescriptor-template.json',
      'https://raw.githubusercontent.com/folio-org/mod-calendar/master/descriptors/ModuleDescriptor-template.json',
      'https://raw.githubusercontent.com/folio-org/mod-agreements/master/service/src/main/okapi/ModuleDescriptor-template.json',
      'https://raw.githubusercontent.com/folio-org/mod-licenses/master/service/src/main/okapi/ModuleDescriptor-template.json',
      'https://raw.githubusercontent.com/folio-org/mod-remote-storage/master/descriptors/ModuleDescriptor-template.json',
      'https://raw.githubusercontent.com/folio-org/mod-copycat/master/descriptors/ModuleDescriptor-template.json'
    ];

    if (modName) {
      let tmp = [];
      for (let x = 0; x < mdUrls.length; x++) {
        if (mdUrls[x].match(modName)) {
          tmp.push(mdUrls[x]);
        }
      }
      if (tmp.length > 0) {
        mdUrls = tmp;
      } else {
        throw new Error(`No match found for module "${modName}!`);
      }
    }

    const skipList = {
      '/accounts': true,
      '/actual-cost-record-storage/actual-cost-records': true,
      '/authority-source-files': true,
      '/authority-storage/authorities': true,
      '/change-manager/parsedRecords': true,
      '/check-in-storage/check-ins': true,
      '/data-export/transformation-fields': true,
      '/data-export/job-executions': true,
      '/data-export/logs': true,
      '/data-export/related-users': true,
      '/feefineactions': true,
      '/finance-storage/transactions': true,
      '/finance-storage/ledger-rollovers-budgets': true,
      '/finance-storage/ledger-rollovers-logs': true,
      '/finance-storage/group-budgets': true,
      '/export': true,
      '/export/*': true,
      '/holdings-storage/holdings': true,
      '/instance-bulk/ids': true,
      '/instance-storage/instance-relationships': true,
      '/instance-storage/instances': true,
      '/inventory-hierarchy/updated-instance-ids': true,
      '/inventory-storage/bound-with-parts': true,
      '/inventory-storage/migrations/jobs': true,
      '/inventory-storage/migrations': true,
      '/inventory-view/instance-set': true,
      '/inventory-view/instances': true,
      '/invoice-storage/invoice-lines': true,
      '/invoice-storage/invoices': true,
      '/item-storage-dereferenced/items': true,
      '/item-storage/items': true,
      '/licenses/amendments': true,
      '/licenses/files': true,
      '/licenses/licenses': true,
      '/loan-storage/loan-history': true,
      '/loan-storage/loans': true,
      '/metadata-provider/logs': true,
      '/notes': true,
      '/notify': true,
      '/oai-pmh-view/instances': true,
      '/oai-pmh-view/updatedInstanceIds': true,
      '/orders-storage/order-invoice-relns': true,
      '/orders-storage/order-lines': true,
      '/orders-storage/orders': true,
      '/orders-storage/po-lines': true,
      '/orders-storage/purchase-orders': true,
      '/orders-storage/receiving-history': true,
      '/orders-storage/pieces': true,
      '/orders-storage/titles': true,
      '/patron-action-session-storage/expired-session-patron-ids': true,
      '/patron-action-session-storage/patron-action-sessions': true,
      '/preceding-succeeding-titles': true,
      '/proxiesfor': true,
      '/record-bulk/ids': true,
      '/request-preference-storage/request-preference': true,
      '/request-storage/requests': true,
      '/scheduled-notice-storage/scheduled-notices': true,
      '/shelf-locations': true,
      '/source-storage/records': true,
      '/source-storage/snapshots': true,
      '/source-storage/source-records': true,
      '/source-storage/sourceRecords': true,
      '/source-storage/stream/records': true,
      '/source-storage/stream/source-records': true,
      '/tlr-feature-toggle-job-storage/tlr-feature-toggle-jobs': true,
      '/users': true,
      '/voucher-storage/vouchers': true,
      '/voucher-storage/voucher-lines': true
    }

    const priority = [
      'location-units__institutions',
      'location-units__campuses',
      'location-units__libraries',
      'locations',
      'service-points',
      'lost-item-fees-policies',
      'overdue-fines-policies',
      'feefines',
      'comments',
      'owners',
      'payments',
      'refunds',
      'waives',
      'transfer-criterias',
      'transfers',
      'manual-block-templates',
      'manualblocks',
      'fixed-due-date-schedule-storage__fixed-due-date-schedules',
      'loan-policy-storage__loan-policies',
      'patron-notice-policy-storage__patron-notice-policies',
      'request-policy-storage__request-policies',
      'staff-slips-storage__staff-slips',
      'cancellation-reason-storage__cancellation-reasons',
      'circulation-rules-storage',
      'organizations-storage__organization-types',
      'organizations-storage__categories',
      'coursereserves__terms',
      'coursereserves__coursetypes',
      'coursereserves__copyrightstatuses',
      'coursereserves__processingstatuses',
      'coursereserves__departments',
      'coursereserves__courselistings',
      'coursereserves__courses',
      'coursereserves__reserves',
      'data-export__mapping-profiles',
      'data-export__job-profiles'
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
        if (name === '${info.app.name}') name = 'agreements';
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
      if (paths[x].path === 'mapping-rules') {
        paths[x].path = 'mapping-rules/marc-bib';
        paths.push({ mod: paths[x].mod, path: 'mapping-rules/marc-holdings' });
        paths.push({ mod: paths[x].mod, path: 'mapping-rules/marc-authority' });
      }
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
        url += '?limit=2500';
      } 
      if (url.match(/data-import-profiles/ && !url.match(/jobProfiles/))) {
        url += '&withRelations=true';
      }
      if (paths[x].path === 'data-import-profiles/profileAssociations') {
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
        continue;
      }
      
      try {
        let res = {};
        // console.log(url);
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
            .timeout({response: 9000})
            .set('accept', 'application/json')
            .set('x-okapi-token', authToken)
        }
        let save = true;
        if (res.body.totalRecords !== undefined && res.body.totalRecords === 0) { 
          save = false;
          console.log('  No records found')
        }
        if (save) {
          let jsonStr = JSON.stringify(res.body, null, 2);
          let fullSaveDir = refDir + '/' + saveDir;
          if (!fs.existsSync(fullSaveDir)) {
            console.log(`(Creating directory: ${saveDir})`);
            fs.mkdirSync(fullSaveDir);
          }
          let p = priority.indexOf(fileName);
          if (p > -1) {
            fileName = `${p}-${fileName}`;
          }
          fs.writeFileSync(`${fullSaveDir}/${fileName}.json`, jsonStr);
        }
        if (paths[x].path == 'service-pointsXXX') {
          res.body.servicepoints.forEach(sp => {
            paths.push({ path: `calendar/dates/${sp.id}/surrounding-openings`, mod: paths[x].mod });
            paths.push({ path: `calendar/dates/${sp.id}/all-openings`, mod: paths[x].mod });
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
    let endTime = new Date().valueOf();
    let ttl = (endTime - startTime) / 1000;
    console.log(`Done in ${ttl} secs`);
  } catch (e) {
    console.error(e.message);
  }
})();
