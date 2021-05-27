const fs = require('fs');
const superagent = require('superagent');
const { getAuthToken } = require('./lib/login');
const fileNames = process.argv.slice(2);
const noPut = process.env.REF_NOPUT;
const start = process.env.LOAD_START;
const doPut = process.env.REF_PUT;

(async () => {
  let added = 0;
  let updated = 0;
  let errors = 0;
  try {
    if (fileNames.length === 0) {
      throw new Error('Usage: node loadUcRefData.js <files>\nNOTE env variables REF_NOPUT, LOAD_START');
    }
    const config = (fs.existsSync('./config.js')) ? require('./config.js') : require('./config.default.js');

    const authToken = await getAuthToken(superagent, config.okapi, config.tenant, config.authpath, config.username, config.password);

    const epMap = {
      "addresstypes": "addresstypes",
      "alternativetitletypes": "alternative-title-types",
      "budgetexpenseclasses": "finance-storage/budget-expense-classes",
      "budgets": "finance-storage/budgets",
      "callnumbertypes": "call-number-types",
      "campuses": "location-units/campuses",
      "cancellationreasons": "cancellation-reason-storage/cancellation-reasons",
      "categories": "organizations-storage/categories",
      "checkins": "check-in-storage/check-ins",
      "circulationrules": "circulation-rules-storage",
      "classificationtypes": "classification-types",
      "configurations": "configurations/entries",
      "contacts": "organizations-storage/contacts",
      "contributornametypes": "contributor-name-types",
      "contributortypes": "contributor-types",
      "customfields": "custom-fields",
      "electronicaccessrelationships": "electronic-access-relationships",
      "expenseclasses": "finance/expense-classes",
      "fees": "accounts",
      "feetypes": "feefines",
      "financegroups": "finance-storage/groups",
      "fiscalyears": "finance-storage/fiscal-years",
      "fixedduedateschedules": "fixed-due-date-schedule-storage/fixed-due-date-schedules",
      "funds": "finance-storage/funds",
      "fundtypes": "finance-storage/fund-types",
      "groupfundfiscalyears": "finance/group-fund-fiscal-years",
      "groups": "groups",
      "holdingnotetypes": "holdings-note-types",
      "holdingtypes": "holdings-types",
      "hridsettings": "hrid-settings-storage/hrid-settings",
      "idtypes": "identifier-types",
      "illpolicies": "ill-policies",
      "instanceformats": "instance-formats",
      "instancenotetypes": "instance-note-types",
      "instancerelationships": "instance-storage/instance-relationships",
      "instancerelationshiptypes": "instance-relationship-types",
      "instancestatuses": "instance-statuses",
      "instancetypes": "instance-types",
      "institutions": "location-units/institutions",
      "interfacecredentials": "organizations-storage/interfaces/{id}/credentials",
      "interfaces": "organizations-storage/interfaces",
      "invoicetransactionsummaries": "finance-storage/invoice-transaction-summaries",
      "itemdamagedstatuses": "item-damaged-statuses",
      "itemnotetypes": "item-note-types",
      "ledgerfiscalyears": "finance-storage/ledger-fiscal-years",
      "ledgers": "finance-storage/ledgers",
      "libraries": "location-units/libraries",
      "loans": "loan-storage/loans",
      "loanpolicies": "loan-policy-storage/loan-policies",
      "loantypes": "loan-types",
      "locations": "locations",
      "logins": "authn/credentials",
      "lostitemfeepolicies": "lost-item-fees-policies",
      "materialtypes": "material-types",
      "modeofissuances": "modes-of-issuance",
      "natureofcontentterms": "nature-of-content-terms",
      "organizations": "organizations-storage/organizations",
      "orderinvoices": "orders-storage/order-invoice-relns",
      "orderitems": "orders-storage/po-lines",
      "orders": "orders-storage/purchase-orders",
      "orders_comp": "orders/composite-orders",
      "ordertemplates": "orders/order-templates",
      "ordertransactionsummaries": "finance-storage/order-transaction-summaries",
      "overduefinepolicies": "overdue-fines-policies",
      "patronnoticepolicies": "patron-notice-policy-storage/patron-notice-policies",
      "payments": "feefineactions",
      "paymentmethods": "payments",
      "permissions": "perms/permissions",
      "permissionsusers": "perms/users",
      "precedingsucceedingtitles": "preceding-succeeding-titles",
      "prefixes": "orders/configuration/prefixes",
      "proxies": "proxiesfor",
      "receivings": "orders/pieces",
      "refundreasons": "refunds",
      "requestpolicies": "request-policy-storage/request-policies",
      "closereasons": "orders/configuration/reasons-for-closure",
      "schedulednotices": "scheduled-notice-storage/scheduled-notices",
      "servicepoints": "service-points",
      "servicepointusers": "service-points-users",
      "snapshots": "source-storage/snapshots",
      "sources": "holdings-sources",
      "staffslips": "staff-slips-storage/staff-slips",
      "statisticalcodes": "statistical-codes",
      "statisticalcodetypes": "statistical-code-types",
      "suffixes": "orders/configuration/suffixes",
      "titles": "orders/titles",
      "transactions": "finance-storage/transactions",
      "userrequestpreferences": "request-preference-storage/request-preference",
      "waivereasons": "waives"
    }
    
    for (let x = 0; x < fileNames.length; x++) {
      let fn = fileNames[x].replace(/^.+\//, '');
      fn = fn.replace(/\.json$/, '');
      let path = epMap[fn];
      if (fn.match(/^records/)) {
        path = 'source-storage/records';
      }
      if (!path) {
        path = fn;
      }
      path = path.replace(/\d{5}$/, '');
      if (path === 'custom-fields') {
        throw new Error('ERROR: Use putCustomFields.js script to load custom-fields!');
      }
      let url = `${config.okapi}/${path}`;
      let collStr = fs.readFileSync(`${fileNames[x]}`, 'utf8');
      let data = JSON.parse(collStr);
      let errRecs = [];
      let dStart = start || 0;
      for (d = dStart; d < data.length; d++) {
        try {
	  if (doPut) throw new Error('Running PUT request only');
          console.log(`[${d}] POST ${data[d].id} to ${url}`);
          let res = await superagent
            .post(url)
            .timeout({ response: 5000 })
            .set('accept', 'application/json', 'text/plain')
            .set('x-okapi-token', authToken)
            .set('content-type', 'application/json')
            .send(data[d]);
          added++;
        } catch (e) {
	  if (e.response) {
            console.log(e.response.text);
          } else {
            console.log(e);
          }
	  if (noPut) {
	    errRecs.push(data[d]);
            errors++;
          } else {
            try {
              let purl = url;
              if (!purl.match(/circulation-rules-storage|hrid-settings/)) {
                purl += '/' + data[d].id;
              }
              console.log(`  PUT ${purl}...`);
              let res = await superagent
                .put(purl)
                .timeout({ response: 5000 })
                .set('accept', 'text/plain')
                .set('x-okapi-token', authToken)
                .set('content-type', 'application/json')
                .send(data[d]);
              updated++;
            } catch (e) {
              let msg;
	      errRecs.push(data[d]);
              try {
                msg = e.response.text;
              } catch (e) {
                msg = err1;
              }
              console.log(`ERROR: ${msg}`);
              errors++;
            } 
          }
        }
      }
      if (errRecs.length > 0) {
        const fn = fileNames[x].replace(/\.json$/, '_err.json');
        fs.writeFileSync(fn, JSON.stringify(errRecs, null, 2));
      } 
      // let doneFn = fileNames[x].replace(/^(.+)\/(.+)/, '$1/x_$2');
      // fs.renameSync(fileNames[x], doneFn);
    } 
    console.log(`Added:   ${added}`);
    console.log(`Updated: ${updated}`);
    console.log(`Errors:  ${errors}`);
  } catch (e) {
    console.error(e.message);
  }
})();
