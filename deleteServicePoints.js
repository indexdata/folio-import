/*
  Delete service points and its service points users by service point id.
*/  

const superagent = require('superagent');
const { getAuthToken } = require('./lib/login');

const sid = process.argv[2];
const debug = process.env.DEBUG;

const wait = (ms) => {
  console.log(`(Waiting ${ms} ms...)`);
  return new Promise((resolve) => setTimeout(resolve, ms));
};

const delSpId = async (config, sid) => {
  let url = `${config.okapi}/service-points-users?query=servicePointsIds=${sid}&limit=5000`;
  console.log(`GET ${url}`);
  try {
    res = await superagent
      .get(url)
      .set('User-Agent', config.agent)
      .set('cookie', config.cookie)
      .set('x-okapi-tenant', config.tenant)
      .set('x-okapi-token', config.token)
    console.log(`INFO service-point-users found: ${res.body.totalRecords}`);
    if (res.body.totalRecords > 0) {
      console.log(`INFO ${res.body.totalRecords} users found with service-point id ${sid}`)
      for (let x = 0; x < res.body.servicePointsUsers.length; x++) {
        let r = res.body.servicePointsUsers[x];
        for (let y = 0; y < r.servicePointsIds.length; y++) {
          let spid = r.servicePointsIds[y];
          if (spid === sid) {
            r.servicePointsIds.splice(y, 1);
            y++;
          }
        }
        await putSpu(config, r);
      }
    } else {
    }
  } catch (e) {
    console.log(`${e}`);
  }
}

const putSpu = async (config, spuRec) => {
  let id = spuRec.id;
  let url = `${config.okapi}/service-points-users/${id}`
  console.log(`INFO PUT to ${url}`);
  try {
    await superagent
      .put(url)
      .set('User-Agent', config.agent)
      .set('cookie', config.cookie)
      .set('x-okapi-tenant', config.tenant)
      .set('x-okapi-token', config.token)
      .send(spuRec);
  } catch (e) {
    console.log(e);
  }
}

const delId = async (config, id, ep) => {
  let url = `${config.okapi}/${ep}/${id}`;
  console.log(`DELETE ${url}`);
  let out;
  try {
    res = await superagent
      .delete(url)
      .set('User-Agent', config.agent)
      .set('cookie', config.cookie)
      .set('x-okapi-tenant', config.tenant)
      .set('x-okapi-token', config.token)
    out = res.body
  } catch (e) {
    console.log(`${e}`);
  }
}

(async () => {
  try {
    if (!sid) {
      throw ('Usage: node deleteServicePoints.js <service-points_id>');
    }

    let start = new Date().valueOf();

    let config = await getAuthToken(superagent);

    await delSpId(config, sid);

    await delId(config, sid, 'service-points');


    let end = new Date().valueOf();
    let tt = (end - start)/1000;
    console.log('Done!');
    console.log('Time:', tt);

  } catch (e) {
    let msg = (debug) ? e : `${e}`; 
    console.log(msg);
  }
    
})();
