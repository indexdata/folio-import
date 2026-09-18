const fs = require('fs');
const superagent = require('superagent');
const { getAuthToken } = require('./lib/login');
const argv = require('minimist')(process.argv.slice(2));
console.log(argv);
let adminUser = argv._[0];
let udate = argv.d || new Date().toISOString().replace(/T.+/, '');
let expected = 0 || parseInt(argv.e, 10);

const getUsers = async (headers, url) => {
    console.log(`GET ${url}`);
    try {
      const res = await superagent
        .get(url)
        .set(headers);
      return res.body;
    } catch(e) {
      console.log(e);
    } 
}

(async () => {
  try {
    if (!adminUser) throw('Usage: nodeImportStats <updatedBy username> [ -d <updatedDate> -e <expected> ]')
    const config = await getAuthToken(superagent);

    let headers = {
      'User-Agent': config.agent,
      'cookie': config.cookie,
      'x-okapi-tenant': config.tenant,
      'x-okapi-token': config.token,
      'accept': 'application/json' 
    };
    let adminId = ''
    let base = `${config.okapi}/users`;
    let url = `${base}?query=username==${adminUser}`;
    let res = await getUsers(headers, url);
    adminId = res.users[0].id
    
    let ttl = {
      updatedBy: adminUser,
      updatedDate: udate,
      updated: 0,
      created: 0,
      total: 0
    };
    url = `${base}?query=metadata.updatedByUserId==${adminId} AND metadata.updatedDate=${udate}&limit=0`;
    res = await getUsers(headers, url);
    ttl.total = res.totalRecords;

    url = `${base}?query=metadata.updatedByUserId==${adminId} AND metadata.createdDate=${udate}&limit=0`;
    res = await getUsers(headers, url);
    ttl.created = res.totalRecords;
    ttl.updated = ttl.total - ttl.created;
    if (expected) {
      ttl.expected = expected;
      ttl.errors = expected - ttl.total;
    }
    
    for (let k in ttl) {
      console.log(k, ':' , ttl[k]);
    }
  } catch(e) {
      console.log(`${e}`);
  }
})();
