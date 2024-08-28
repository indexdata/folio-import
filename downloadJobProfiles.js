const fs = require('fs');
const superagent = require('superagent');
const { getAuthToken } = require('./lib/login');
let profId = process.argv[2];

(async () => {
  try {

    const config = await getAuthToken(superagent);;

    let jids = [];

    const getProfs = async (jid, ptype) => {
      let url = `${config.okapi}/data-import-profiles/profileSnapshots/${jid}?profileType=${ptype}&jobProfileId=${jid}`;
      console.log('GET', url);
      try {
        let res = await superagent
          .get(url)
          .set('x-okapi-token', config.token);
        let ostr = JSON.stringify(res.body);
        return res.body;
      } catch (e) {
        console.error(e.message);
      }
    }
    
    const addRelation = (profileId, contentType, childSnapshotWrappers) => {
      childSnapshotWrappers.forEach(c => {
        const out = {
          masterProfileId: profileId,
          masterProfileType: contentType,
          detailProfileId: c.profileId,
          detailProfileType: c.contentType,
          order: c.order
        }
        if (c.reactTo) out.reactTo = c.reactTo;
        console.log(out);
        if (c.childSnapshotWrappers) {
          addRelation(c.profileId, c.contentType, c.childSnapshotWrappers);
        }
      });
    }

    if (profId) {
      jids.push(profId);
    } else {
      try {
        console.log('Getting job profiles...');
        let res = await superagent
          .get(`${config.okapi}/data-import-profiles/jobProfiles?limit=1000`)
          .set('x-okapi-token', config.token);

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
      // console.log(JSON.stringify(prof, null, 2));
      const pc = prof.content;
      delete pc.parentProfiles;
      delete pc.childProfiles;
      delete pc.metadata;
      const out = {
        profile: pc,
        addedRelations: [],
        deletedRelations: [],
      }
      addRelation(prof.profileId, prof.contentType, prof.childSnapshotWrappers);
      
      // console.log(out);
    }
 } catch (e) {
    console.error(e.message);
  }
})();
