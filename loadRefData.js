const fs = require('fs');
const superagent = require('superagent');
const { getAuthToken } = require('./lib/login');
const fileNames = process.argv.slice(2);
const cl = console.log;
const logSeen = {}
let logPath;

console.log = (msg, path) => {
  if (path) {
    if (!logSeen[path] && fs.existsSync(path)) fs.unlinkSync(path);
    fs.writeFileSync(path, msg + '\n', { flag: 'a'});
    logSeen[path] = 1;
  }
  cl(msg);
}

(async () => {
  try {
    if (fileNames.length === 0) {
      throw new Error('Usage: node loadRefData.js <files>');
    }

    const config = await getAuthToken(superagent);

    for (let x = 0; x < fileNames.length; x++) {
      let added = 0;
      let updated = 0;
      let errors = 0;
      logPath = fileNames[x] + '.log';
      
      let path = fileNames[x].replace(/^.+\//, '');

      path = path.replace(/__/g, '/');
      path = path.replace(/\.json$/, '');
      path = path.replace(/^\d+-/, '');
      path = path.replace(/%3D/g, '=');
      path = path.replace(/%26/g, '&');
      path = path.replace(/%3F/g, '?');
      let url = `${config.okapi}/${path}`;
      let collStr = fs.readFileSync(`${fileNames[x]}`, 'utf8');
      let coll = JSON.parse(collStr);
      let collKeys = Object.keys(coll).filter(f => { 
        if (f.match(/resultInfo|totalRecords/)) { 
          return false;
        } else {
          return true;
        }
      });
      let data = [];
      if (path.match(/mapping-rules/)) {
        data.push(coll);
      } else if (Array.isArray(coll[collKeys[0]])) {
        data = coll[collKeys[0]];
      } else if (Array.isArray(coll)) {
	      data = coll;
      } else {
        data.push(coll);
      }
      if (collKeys[0] === 'authoritySourceFiles') {
	     let tmp = [];
	     data.forEach(d => {
		     if (d.source === 'local') {
			     let c = d.codes[0];
			     d.code = c;
			     delete d.codes;
			     tmp.push(d);
		     }
	     });
	     data = tmp;
      }
      for (d = 0; d < data.length; d++) {
        if (path.match(/data-import-profiles.+Profiles$/ && !path.match(/_UPDATE/))) {
          let upPath = fileNames[x] + '_UPDATE';
          if (fs.existsSync(upPath)) fs.unlinkSync(upPath);
          if (!data[d].profile) data[d] = { profile: data[d] };
          data[d].id = data[d].profile.id;
          upProf = JSON.parse(JSON.stringify(data[d]));
          data[d].profile.parentProfiles = [];
          data[d].profile.childProfiles = [];
          if (data[d].addedRelations) {
            data[d].addedRelations = data[d].profile.addedRelations;
            delete data[d].profile.addedRelations;
          }
          if (path.match(/actionProfiles/)) {
            if (upProf.profile.childProfiles) {
              upProf.addedRelations = [];
              upProf.profile.childProfiles.forEach(c => {
                let o = {
                  masterProfileId: upProf.profile.id,
                  masterProfileType: 'ACTION_PROFILE',
                  detailProfileId: c.id,
                  detailProfileType: c.contentType
                };
                upProf.profile.parentProfiles = [];
                upProf.profile.childProfiles = [];
                upProf.addedRelations.push(o);
              });
            }
            let upOut = JSON.stringify(upProf, null, 2);
            fs.writeFileSync(upPath, upOut, { flag: 'a' });

          }
        } else if (path.match(/data-import-profiles\/profileAssociations/)) {
          if (data[d].masterWrapperId) delete data[d].masterWrapperId;
          if (data[d].detailWrapperId) delete data[d].detailWrapperId;
          if (data[d].jobProfileId !== undefined) delete data[d].jobProfileId;
        } else if (path.match(/data-export\/mapping-profiles/)) {
          if (!data[d].transformations) data[d].transformations = [];
        }
        try {
          url = url.replace(/\.json_UPDATE/, '');
          console.log(`POST ${url}...`, logPath);
          let res = await superagent
            .post(url)
            .timeout({ response: 5000 })
            .set('accept', 'application/json', 'text/plain')
            .set('x-okapi-token', config.token)
            .set('content-type', 'application/json')
            .send(data[d]);
          added++;
        } catch (e) {
          if (process.env.DEBUG) {
            console.log(e, logPath);
          } else {
            console.log(`${e}`, logPath);
          }
          try {
            console.log(`  Trying PUT...`, logPath);
            let purl = url;
            if (!purl.match(/circulation-rules-storage|mapping-rules/)) {
              purl += '/' + data[d].id;
            }
            console.log(`  PUT ${purl}...`, logPath);
            let res = await superagent
              .put(purl)
              .timeout({ response: 5000 })
              .set('accept', 'text/plain')
              .set('x-okapi-token', config.token)
              .set('content-type', 'application/json')
              .send(data[d]);
            updated++;
          } catch (e) {
            console.log(`  ${e}`, logPath);
            errors++;
          } 
        }
      }
      console.log(`Added:   ${added}`, logPath);
      console.log(`Updated: ${updated}`, logPath);
      console.log(`Errors:  ${errors}`, logPath);
    } 
  } catch (e) {
    console.log(e.message, logPath);
  }
})();
