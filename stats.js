const fs = require('fs');
const superagent = require('superagent');
const { getAuthToken } = require('./lib/login');
let mod = process.argv[2] || 'inventory';

const mods = {
  inventory: { 
    instances: 'instance-storage/instances',
    holdings: 'holdings-storage/holdings',
    items: 'item-storage/items',
    srs: 'source-storage/records?state=ACTUAL',
    'pre/suc': 'preceding-succeeding-titles',
    'relationships': 'instance-storage/instance-relationships',
    'bound-withs': 'inventory-storage/bound-with-parts',
    search: 'search/instances?query=id==*&limit=0'
  },
  users: {
    users: 'users',
    'perms/users': 'perms/users',
    'request prefs': 'request-preference-storage/request-preference',
    'patron groups': 'groups',
    'notes': 'notes?query=domain==users',
    'blocks': 'manualblocks'
  },
  circ: {
    loans: 'loan-storage/loans',
    '-open loans': 'loan-storage/loans?query=status.name==open&limit=0',
    '-closed loans': 'loan-storage/loans?query=status.name==closed&limit=0',
    '-held loans': 'loan-storage/loans?query=forUseAtLocation.status==Held&limit=0',
    requests: 'circulation/requests',
    '-open requests': 'circulation/requests?query=status=open',
    '-closed requests': 'circulation/requests?query=status=closed'
  },
  auth: {
	  authorities: 'authority-storage/authorities?limit=1',
	  srs: 'source-storage/records?recordType=MARC_AUTHORITY&state=ACTUAL&limit=1'
  },
  orgs: {
    organizations: 'organizations-storage/organizations',
    contacts: 'organizations-storage/contacts',
    interfaces: 'organizations-storage/interfaces',
    notes: 'notes?query=domain==organizations&limit=1'
  },
  erm: {
    agreements: 'erm/sas?stats=true',
    licenses: 'licenses/licenses?stats=true',
    notes: 'notes?query=domain==agreements&limit=1'
  },
  orders: {
    purchaseOrders: 'orders-storage/purchase-orders',
    poLines: 'orders-storage/po-lines',
    compositeOrders: 'orders/composite-orders',
    polNotes: 'notes?query=domain==orders'
  }
};

const allMods = {};
for (let m in mods) {
  for (let n in mods[m]) {
    let k = m + ':' + n;
    allMods[k] = mods[m][n];
  }
};
mods.all = allMods;

(async () => {
  try {
    if (!mod) throw(`Usage node stats <module>`);
    let choices = Object.keys(mods).join('|');
    if (!mods[mod]) throw(`No module found for "${mod}". Choices: ${choices}`);
    const config = await getAuthToken(superagent);
    let div = '-------------------------------';
    console.log(`${mod} totals...`);
    console.log(div);
    for (let t in mods[mod]) {
      let ep = mods[mod][t];

      let url = `${config.okapi}/${ep}?limit=0`;
      if (ep.match(/\?/)) url = `${config.okapi}/${ep}`;
      try {
        const res = await superagent
        .get(url)
        .set('User-Agent', config.agent)
        .set('cookie', config.cookie)
        .set('x-okapi-tenant', config.tenant)
        .set('x-okapi-token', config.token)
        .set('accept', 'application/json');
        let ttl = res.body.totalRecords
        let ttlStr = ttl.toString().padStart(8, ' ');
        let tstr = t.padEnd(24, ' ');
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
