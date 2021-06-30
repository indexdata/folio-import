/*
  This script will atempt to find locations that have no holdings either delete or 
  save the empty location obects to STDOUT.
*/

const fs = require('fs');
const superagent = require('superagent');
const { getAuthToken } = require('./lib/login');
const action = process.argv[2];

(async () => {
  try {
    if (!action || !action.match(/find|delete/)) {
      throw new Error('Usage: deleteEmptyLocations <action (find|delete)>');
    }
    const config = (fs.existsSync('./config.js')) ? require('./config.js') : require('./config.default.js');
    const authToken = await getAuthToken(superagent, config.okapi, config.tenant, config.authpath, config.username, config.password);
    
    const locUrl = `${config.okapi}/locations?query=isActive==true&limit=5000`;
    console.warn(`Getting locations ${locUrl}`);
      try {
        let res = await superagent
          .get(locUrl)
          .set('x-okapi-token', authToken)
          .set('accept', 'application/json');
        let totLocs = res.body.totalRecords;
        console.warn(`${totLocs} active locations found...`);
        if (totLocs > 0) {
          for (let x = 0; x < res.body.locations.length; x++) {
            let l = res.body.locations[x];
            let hurl = `${config.okapi}/holdings-storage/holdings?query=permanentLocationId==${l.id}&limit=0`;
            let hres = await superagent
              .get(hurl)
              .set('x-okapi-token', authToken)
              .set('accept', 'application/json');
            let hcount = hres.body.totalRecords;
            if (action === 'delete' && hcount === 0) {
              console.log(`No holdings found for location ${l.id} -- deleting location`);
              let durl = `${config.okapi}/locations/${l.id}`;
              let dres = await superagent
                .delete(durl)
                .set('x-okapi-token', authToken)
                .set('accept', 'text/plain')
            } else if (hcount === 0) {
              console.log(JSON.stringify(l));
            } else {
              console.warn(`${hcount} holdings found for "${l.name}"`)
            }
          }
        }
      } catch (e) {
        console.log(e.response || e);
      }
  } catch (e) {
    console.log(e.message);
  }
})();
