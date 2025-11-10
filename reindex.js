const fs = require('fs');
const superagent = require('superagent');
const { getAuthToken } = require('./lib/login');
let ty = process.argv[2];

(async () => {
  try {
    if (!ty) throw(`Usage node reindex.js <type: inst|auth> `);

    tmap = {
      inst: 'instance',
      auth: 'authority'
    }
    
    let rn = tmap[ty];
    if (!rn) throw Error(`"${ty}" is not a proper resourceName!`);
    let pl = { recreateIndex: true, resourceName: 'linked-data-instance' };
	  pl = {};
	  pl = {
		    "indexSettings": {
			        "numberOfShards": 2,
			        "numberOfReplicas": 4,
			        "refreshInterval": 1
			      }
	  };

    const config = await getAuthToken(superagent);

    let url = `${config.okapi}/search/index/instance-records/reindex/full`;
    console.log('POST', url);
    try {
      const res = await superagent
      .post(url)
      .set('User-Agent', config.agent)
      .set('cookie', config.cookie)
      .set('x-okapi-tenant', config.tenant)
      .set('x-okapi-token', config.token)
      .set('Content-type', 'application/json')
      .send(pl);
      console.log(JSON.stringify(res.body, null, 2));
    } catch (e) {
      console.log(e);
    }
  } catch(e) {
      console.log(e);
  }
})();
