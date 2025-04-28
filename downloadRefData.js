const fs = require('fs');
const superagent = require('superagent');
const { getAuthToken } = require('./lib/login');
let refDir = process.argv[2];
let modName = process.argv[3];

(async () => {
  try {
    if (!refDir) {
      throw new Error('Usage: node downloadAllRefData.js <reference_dir> [ <mod_name_regexp> ]');
    } else if (!fs.existsSync(refDir)) {
      throw new Error('Reference directory does\'t exist!');
    } else if (!fs.lstatSync(refDir).isDirectory()) {
      throw new Error(`${refDir} is not a directory!`)
    }
    refDir = refDir.replace(/\/$/, '');
    let suMod = 'system_users';

    let startTime = new Date().valueOf();

    let config = await getAuthToken(superagent);
    let authToken = config.token;

    let mdUrls = [
      'https://raw.githubusercontent.com/folio-org/mod-inventory-storage/master/descriptors/ModuleDescriptor-template.json',
      'https://raw.githubusercontent.com/folio-org/mod-calendar/master/descriptors/ModuleDescriptor-template.json',
      'https://raw.githubusercontent.com/folio-org/mod-users/master/descriptors/ModuleDescriptor-template.json',
      'https://raw.githubusercontent.com/folio-org/mod-permissions/master/descriptors/ModuleDescriptor-template.json',
      'https://raw.githubusercontent.com/folio-org/mod-feesfines/master/descriptors/ModuleDescriptor-template.json',
      'https://raw.githubusercontent.com/folio-org/mod-circulation-storage/master/descriptors/ModuleDescriptor-template.json',
      'https://raw.githubusercontent.com/folio-org/mod-template-engine/master/descriptors/ModuleDescriptor-template.json',
      'https://raw.githubusercontent.com/folio-org/mod-patron-blocks/master/descriptors/ModuleDescriptor-template.json',
      'https://raw.githubusercontent.com/folio-org/mod-configuration/master/descriptors/ModuleDescriptor-template.json',
      'https://raw.githubusercontent.com/folio-org/mod-email/master/descriptors/ModuleDescriptor-template.json',
      'https://raw.githubusercontent.com/folio-org/mod-notes/master/descriptors/ModuleDescriptor-template.json',
      // 'https://raw.githubusercontent.com/folio-org/mod-tags/master/descriptors/ModuleDescriptor-template.json',
      'https://raw.githubusercontent.com/folio-org/mod-data-export/master/descriptors/ModuleDescriptor-template.json',
      'https://raw.githubusercontent.com/folio-org/mod-organizations-storage/master/descriptors/ModuleDescriptor-template.json',
      'https://raw.githubusercontent.com/folio-org/mod-finance-storage/master/descriptors/ModuleDescriptor-template.json',
      'https://raw.githubusercontent.com/folio-org/mod-orders-storage/master/descriptors/ModuleDescriptor-template.json',
      'https://raw.githubusercontent.com/folio-org/mod-invoice-storage/master/descriptors/ModuleDescriptor-template.json',
      'https://raw.githubusercontent.com/folio-org/mod-courses/master/descriptors/ModuleDescriptor-template.json',
      'https://raw.githubusercontent.com/folio-org/mod-copycat/master/descriptors/ModuleDescriptor-template.json',
      'https://raw.githubusercontent.com/folio-org/mod-entities-links/refs/heads/master/descriptors/ModuleDescriptor-template.json',
      'https://raw.githubusercontent.com/folio-org/mod-data-import/master/descriptors/ModuleDescriptor-template.json',
      'https://raw.githubusercontent.com/folio-org/mod-di-converter-storage/master/descriptors/ModuleDescriptor-template.json',
      'https://raw.githubusercontent.com/folio-org/mod-source-record-storage/master/descriptors/ModuleDescriptor-template.json',
      'https://raw.githubusercontent.com/folio-org/mod-source-record-manager/master/descriptors/ModuleDescriptor-template.json',
      // 'https://raw.githubusercontent.com/folio-org/mod-agreements/master/service/src/main/okapi/ModuleDescriptor-template.json',
      // 'https://raw.githubusercontent.com/folio-org/mod-licenses/master/service/src/main/okapi/ModuleDescriptor-template.json',
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
      '/authority-storage/authorities': true,
      '/authority-storage/reindex': true,
      '/change-manager/parsedRecords': true,
      '/check-in-storage/check-ins': true,
      '/check-out-lock-storage': true,
      '/configurations/audit.json': true,
      '/data-export/transformation-fields': true,
      '/data-export/job-executions': true,
      '/data-export/logs': true,
      '/data-export/related-users': true,
      '/data-import/uploadUrl': true,
      '/data-import/uploadUrl/subsequent': true,
      '/data-import-profiles/profileAssociations': true,
      '/data-import/testFileSplit': true,
      '/email': true,
      '/feefineactions': true,
      '/finance-storage/transactions': true,
      '/finance-storage/ledger-rollovers-budgets': true,
      '/finance-storage/ledger-rollovers-logs': true,
      '/finance-storage/ledger-rollovers': true,
      '/finance-storage/ledger-rollovers-progress': true,
      '/finance-storage/ledger-rollovers-errors': true,
      '/finance-storage/group-budgets': true,
      '/finance-storage/budgets': true,
      '/finance-storage/fiscal-years': true,
      '/finance-storage/funds': true,
      '/finance-storage/group-fund-fiscal-years': true,
      '/finance-storage/ledgers': true,
      '/export': true,
      '/export/*': true,
      '/holdings-storage/holdings': true,
      '/hrid-settings-storage/hrid-settings': true,
      '/instance-bulk/ids': true,
      '/instance-storage/instance-relationships': true,
      '/instance-storage/instances': true,
      '/inventory-hierarchy/updated-instance-ids': true,
      '/inventory-storage/bound-with-parts': true,
      '/inventory-storage/migrations/jobs': true,
      '/inventory-storage/migrations': true,
      '/inventory-view/instance-set': true,
      '/inventory-view/instances': true,
      '/instance-storage__reindex': true,
      '/invoice-storage/invoice-lines': true,
      '/invoice-storage/invoices': true,
      '/invoice-storage/invoice-line-number': true,
      '/invoice-storage/invoice-number': true,
      '/item-storage-dereferenced/items': true,
      '/item-storage/items': true,
      '/licenses/amendments': true,
      '/licenses/files': true,
      '/licenses/licenses': true,
      '/linking-rules/instance-authority': true,
      '/links/instances': true,
      '/links/stats/instance': true,
      '/links/stats/authority': true,
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
      '/orders-storage/po-line-number': true,
      '/orders-storage/po-lines': true,
      '/orders-storage/po-number': true,
      '/orders-storage/purchase-orders': true,
      '/orders-storage/receiving-history': true,
      '/orders-storage/pieces': true,
      '/orders-storage/titles': true,
      '/organizations-storage/contacts': true,
      '/organizations-storage/interfaces': true,
      '/organizations-storage/organizations': true,
      '/organizations-storage/settings': true,
      '/patron-action-session-storage/expired-session-patron-ids': true,
      '/patron-action-session-storage/patron-action-sessions': true,
      '/preceding-succeeding-titles': true,
      '/proxiesfor': true,
      '/record-bulk/ids': true,
      '/request-preference-storage/request-preference': true,
      '/request-storage/requests': true,
      '/scheduled-notice-storage/scheduled-notices': true,
      '/shelf-locations': true,
      '/service-point-users': true,
      '/source-storage/records': true,
      '/source-storage/snapshots': true,
      '/source-storage/source-records': true,
      '/source-storage/sourceRecords': true,
      '/source-storage/stream/records': true,
      '/source-storage/stream/source-records': true,
      '/staging-users': true,
      '/tlr-feature-toggle-job-storage/tlr-feature-toggle-jobs': true,
      '/users': true,
      '/users/configurations/entry': true,
      '/voucher-storage/vouchers': true,
      '/voucher-storage/voucher-number': true,
      '/voucher-storage/voucher-number/start': true,
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
      'owners',
      'feefines',
      'comments',
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
      let ordStr = z.toString().padStart(2, '0')
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
            pp = pp.replace(/{recordType}/, '');
            if (method === 'GET' && !pp.match(/\{|^\/_/)) {
              if (skipList[pp]) {
                console.log(`Skipping ${pp}`);
              } else {
                pp = pp.replace(/^\//, '');
                paths.push({ mod: ordStr + '-' + name, path: pp });
              }
            }
          }
        }
      } catch (e) {
        console.error(e.message);
      }
    }
    paths.push({mod: 'system_users', path: 'users?query=personal.lastName==system%20OR%20username==canary-svc&limit=100'});

    for (let x = 0; x < paths.length; x++) {
      if (paths[x].path === 'mapping-rules/') {
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
      } else if (url.match(/\/authority/)) {
        url += '?limit=1000';
      } else if (!url.match(/\?/)) {
        url += '?limit=2500';
      } 
      if (url.match(/data-import-profiles\/\w+Profiles/)) {
        url += '&withRelations=true';
      }
      if (paths[x].path === 'data-import-profiles/profileAssociations') {
        continue;
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
            console.log(`\x1b[32m(Creating directory: ${saveDir})\x1b[0m`);
            fs.mkdirSync(fullSaveDir);
          }
          let p = priority.indexOf(fileName);
          if (p > -1) {
            let pstr = p.toString().padStart(2, '0');
            fileName = `${pstr}-${fileName}`;
          }
          fs.writeFileSync(`${fullSaveDir}/${fileName}.json`, jsonStr);
        }
        if (paths[x].path == 'organizations-storage/interfaces') {
          res.body.interfaces.forEach(r => {
            paths.push({ path: `${paths[x].path}/${r.id}/credentials`, mod: paths[x].mod });
          });
        }
        if (paths[x].path.match(/personal.lastName/)) {
          let pqs = [];
          let uns = [];
          res.body.users.forEach(r => {
            pqs.push(r.id);
            uns.push({username: r.username, userId: r.id});
          });
          let pq = pqs.join('%20OR%20userId=');
          let ep = `perms/users?query=userId=${pq}`
          paths.push({ path: ep, mod: suMod });
          // create credentials objects and POST to authn/credentials
          let creds = [];
          let noCreds = [];
          uns.forEach(un => {
            un.password = (config.syscreds && config.syscreds[un.username]) ? config.syscreds[un.username] : '';
            if (un.password) {
              creds.push(un);
            } else {
              noCreds.push(un);
            }
          });
          if (creds[0]) {
            let out = { creds: creds };
            let outStr = JSON.stringify(out, null, 2);
            fs.writeFileSync(`${refDir}/${suMod}/authn__credentials.json`, outStr);
          } 
          if (noCreds[0]) {
            let out = { creds: noCreds };
            let outStr = JSON.stringify(out, null, 2);
            fs.writeFileSync(`${refDir}/${suMod}/authn__nopass.json`, outStr); 
          }
        }
      } catch (e) {
        try {
          console.log(`\x1b[31m${e}\x1b[0m`);
        } catch {
          console.log(e.message);
        }
      }
    }
    let endTime = new Date().valueOf();
    let ttl = (endTime - startTime) / 1000;
    console.log(`\x1b[33mDone in ${ttl} secs\x1b[0m`);
  } catch (e) {
    console.error(e.message);
  }
})();
