const fs = require('fs');
const superagent = require('superagent');
const { getAuthToken } = require('./lib/login');
let profId = process.argv[2];

(async () => {
  try {
    const config = (fs.existsSync('./config.js')) ? require('./config.js') : require('./config.default.js');

    const authToken = await getAuthToken(superagent, config.okapi, config.tenant, config.authpath, config.username, config.password);

    let jids = [];

    const getProfs = async (jid, ptype) => {
      let url = `${config.okapi}/data-import-profiles/profileSnapshots/${jid}?profileType=${ptype}&jobProfileId=${jid}`;
      console.log('GET', url);
      try {
        let res = await superagent
          .get(url)
          .set('x-okapi-token', authToken);
        let ostr = JSON.stringify(res.body);
        return res.body;
      } catch (e) {
        console.error(e.message);
      }
    }

    if (profId) {
      jids.push(profId);
    } else {
      try {
        console.log('Getting job profiles...');
        let res = await superagent
          .get(`${config.okapi}/data-import-profiles/jobProfiles?limit=1000`)
          .set('x-okapi-token', authToken);

        res.body.jobProfiles.forEach(j => {
          jids.push(j.id);
        });
      } catch (e) {
        console.log(e);
      }
    }
    console.log('Job profiles found:', jids.length);
    let ptype = 'JOB_PROFILE';
    for (let z = 0; z < jids.length; z++) {
      let jid = jids[z];
      let prof = await getProfs(jid, ptype);
      console.log(JSON.stringify(prof, null, 2));
      const pc = prof.content;
      delete pc.parentProfiles;
      delete pc.childProfiles;
      delete pc.metadata;
      const out = {
        profile: pc,
        addedRelations: [],
        deletedRelations: [],
      }
      while (prof.childSnapshotWrappers) {
        console.log(prof);
        prof = prof.childSnapshotWrappers[0];
      }
    }
 } catch (e) {
    console.error(e.message);
  }
})();
