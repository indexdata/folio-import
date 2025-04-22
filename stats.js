const fs = require('fs');
const superagent = require('superagent');
const { getAuthToken } = require('./lib/login');
let mod = process.argv[2] || 'inventory';

const mods = {
  inventory: { 
    instances: 'instance-storage/instances',
    holdings: 'holdings-storage/holdings',
    items: 'item-storage/items',
    srs: 'source-storage/records',
    'pre/suc': 'preceding-succeeding-titles',
    'relationships': 'instance-storage/instance-relationships',
    'bound-withs': 'inventory-storage/bound-with-parts'
  },
  users: {
    users: 'users',
    'perms/users': 'perms/users',
    'request prefs': 'request-preference-storage/request-preference',
    'patron groups': 'groups'
  },
  auth: {
	  authorities: 'authority-storage/authorities',
	  srs: 'source-storage/records?recordType=MARC_AUTHORITY'
  }
};

(async () => {
  try {
    if (!mod) throw(`Usage node stats <module>`);
    const config = await getAuthToken(superagent);
    console.log(`${mod} totals:`);
    let div = '-------------------------------';
    console.log(div);
    for (let t in mods[mod]) {
      let ep = mods[mod][t];

      let url = `${config.okapi}/${ep}?limit=0`;
      if (mod === 'auth') url = `${config.okapi}/${ep}`;
      try {
        const res = await superagent
        .get(url)
        .set('x-okapi-token', config.token)
        .set('accept', 'application/json');
        let ttl = res.body.totalRecords
        let ttlStr = ttl.toString().padStart(8, ' ');
        let tstr = t.padEnd(20, ' ');
        console.log(`${tstr}`, ttlStr);
        
      } catch (e) {
        console.log(`${e}`);
      }
    }
    console.log(div);
  } catch(e) {
      console.log(`${e}`);
  }
})();
