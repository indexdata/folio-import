const fs = require('fs');
const superagent = require('superagent');
const { getAuthToken } = require('./lib/login');
const fileNames = process.argv.slice(2);

(async () => {
  let added = 0;
  let updated = 0;
  let errors = 0;
  try {
    if (fileNames.length === 0) {
      throw new Error('Usage: node loadUcRefData.js <files>');
    }
    const config = (fs.existsSync('./config.js')) ? require('./config.js') : require('./config.default.js');

    const authToken = await getAuthToken(superagent, config.okapi, config.tenant, config.authpath, config.username, config.password);

    const epMap = {
      "addresstypes": "addresstypes",
      "alternativetitletypes": "alternative-title-types",
      "callnumbertypes": "call-number-types",
      "campuses": "location-units/campuses ",
      "categories": "organizations-storage/categories",
      "classificationtypes": "classification-types",
      "contacts": "organizations-storage/contacts",
      "contributornametypes": "contributor-name-types",
      "contributortypes": "contributor-types",
      "electronicaccessrelationships": "electronic-access-relationships",
      "fees": "accounts",
      "groups": "groups",
      "holdingnotetypes": "holdings-note-types",
      "holdingtypes": "holdings-types",
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
      "itemdamagedstatuses": "item-damaged-statuses",
      "itemnotetypes": "item-note-types",
      "libraries": "location-units/libraries",
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
      "ordertemplates": "orders-storage/order-templates",
      "permissions": "perms/permissions",
      "prefixes": "orders-storage/configuration/prefixes",
      "proxies": "proxiesfor",
      "reasonsforclosures": "orders-storage/configuration/reasons-for-closure",
      "servicepoints": "service-points",
      "servicepointusers": "service-points-users",
      "statisticalcodes": "statistical-codes",
      "statisticalcodetypes": "statistical-code-types",
      "suffixes": "orders-storage/configuration/suffixes",
      "titles": "orders-storage/titles",
      "permissionsusers": "perms/users",
      "hridsettings": "hrid-settings-storage/hrid-settings",
    }
    
    for (let x = 0; x < fileNames.length; x++) {
      let fn = fileNames[x].replace(/^.+\//, '');
      fn = fn.replace(/\.json$/, '');
      let path = epMap[fn];
      if (!path) {
        path = fn;
      }
      path = path.replace(/\d{5}$/, '');
      let url = `${config.okapi}/${path}`;
      let collStr = fs.readFileSync(`${fileNames[x]}`, 'utf8');
      let data = JSON.parse(collStr);
      let errRecs = [];
      for (d = 0; d < data.length; d++) {
        try {
          console.log(`[${d}] POST ${url}...`);
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
          }
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
      if (errRecs.length > 0) {
        const fn = fileNames[x].replace(/\.json$/, '_err.json');
        fs.writeFileSync(fn, JSON.stringify(errRecs, null, 2));
      }
    } 
    console.log(`Added:   ${added}`);
    console.log(`Updated: ${updated}`);
    console.log(`Errors:  ${errors}`);
  } catch (e) {
    console.error(e.message);
  }
})();
