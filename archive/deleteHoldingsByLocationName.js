/*
  Take a location name (or part thereof), finds all locationIds for each location
  name, find holdings with locationId, delete items with holdingId and then delete
  holdings record.
*/

const fs = require('fs');
const superagent = require('superagent');
const { getAuthToken } = require('./lib/login');
const locName = process.argv[2];

(async () => {
  try {
    if (!locName) {
      throw new Error('Usage: node deleteHoldingsByLocationName.js <location name>');
    }

    const config = (fs.existsSync('./config.js')) ? require('./config.js') : require('./config.default.js');

    const authToken = await getAuthToken(superagent, config.okapi, config.tenant, config.authpath, config.username, config.password);
    const res = await superagent
      .get(`${config.okapi}/locations?query=name==${locName}*&limit=1000`)
      .set('accept', 'application/json')
      .set('x-okapi-tenant', config.tenant)
      .set('x-okapi-token', authToken);
    const locCount = res.body.totalRecords;
    console.log(`Found ${locCount} locations for ${locName}*`);

    if (locCount > 0) {
      let locations = res.body.locations;
      for (let w = 0; w < locations.length; w++) {
        loc = locations[w];
        let hres = await superagent
          .get(`${config.okapi}/holdings-storage/holdings?query=permanentLocationId==${loc.id}&limit=100`)
          .set('accept', 'application/json')
          .set('x-okapi-tenant', config.tenant)
          .set('x-okapi-token', authToken);
        holdCount = hres.body.totalRecords;
        if (holdCount > 0) {
          let hrecs = hres.body.holdingsRecords;
          console.log(`${holdCount} holdings found for ${loc.name}`);
          for (let x = 0; x < hrecs.length; x++) {
            let h = hrecs[x];
            let ires = await superagent
              .get(`${config.okapi}/item-storage/items?query=holdingsRecordId==${h.id}&limit=1000`)
              .set('accept', 'application/json')
              .set('x-okapi-tenant', config.tenant)
              .set('x-okapi-token', authToken);
            itemCount = ires.body.totalRecords;
            if (itemCount > 0) {
              let irecs = ires.body.items;
              console.log(itemCount);
              for (let y = 0; y < irecs.length; y++) {
                let irec = irecs[y];
                console.log(irec.id);
              }
            }
          };
        }
      };
    }
  } catch (e) {
    console.error(e.message);
  }
})();
