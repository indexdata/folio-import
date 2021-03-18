const fs = require('fs');
const superagent = require('superagent');
const { getAuthToken } = require('./lib/login');
const fileNames = process.argv.slice(2);

(async () => {
  let added = 0;
  let updated = 0;
  let errors = 0;
  try {
    if (fileNames.length === 0) {
      throw new Error('Usage: node loadRefData.js <files>');
    }
    const config = (fs.existsSync('./config.js')) ? require('./config.js') : require('./config.default.js');

    const authToken = await getAuthToken(superagent, config.okapi, config.tenant, config.authpath, config.username, config.password);

    for (let x = 0; x < fileNames.length; x++) {
      let refDir = fileNames[x].replace(/^(.+\/).+/, '$1');
      let doneDir = refDir + 'Done';
      let errDir = refDir + 'Err';
      
      let path = fileNames[x].replace(/^.+\//, '');
      let name = path;

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
      if (Array.isArray(coll[collKeys[0]])) {
        data = coll[collKeys[0]];
      } else if (Array.isArray(coll)) {
	data = coll;
      } else {
        data.push(coll);
      }
      for (d = 0; d < data.length; d++) {
        if (path.match(/data-import-profiles.+Profiles/)) {
          data[d] = { profile: data[d] };
        }
        try {
          console.log(`POST ${url}...`);
          let res = await superagent
            .post(url)
            .timeout({ response: 5000 })
            .set('accept', 'application/json', 'text/plain')
            .set('x-okapi-token', authToken)
            .set('content-type', 'application/json')
            .send(data[d]);
          added++;
        } catch (e) {
          let postErr = e;
          console.log('  ' + postErr.response.text);
          try {
            console.log(`  Trying PUT...`);
            let purl = url;
            if (!purl.match(/circulation-rules-storage/)) {
              purl += '/' + data[d].id;
            }
            console.log(`  PUT ${purl}...`);
            let res = await superagent
              .put(purl)
              .timeout({ response: 5000 })
              .set('accept', 'text/plain')
              .set('x-okapi-token', authToken)
              .set('content-type', 'application/json')
              .send(data[d]);
            updated++;
          } catch (e) {
            let msg;
            let err1 = e;
            try {
              msg = e.response.res.text;
            } catch (e) {
              msg = err1.message;
            }
            console.log(`  ERROR: ${msg}`);
            errors++;
          } 
        }
      }
      if (errors == 0) {
        if (!fs.existsSync(doneDir)) fs.mkdirSync(doneDir);
        fs.renameSync(fileNames[x], doneDir + '/' + name);
      } else {
        if (!fs.existsSync(errDir)) fs.mkdirSync(errDir);
        fs.renameSync(fileNames[x], errDir + '/' + name);
      }
    } 
    console.log(`Added:   ${added}`);
    console.log(`Updated: ${updated}`);
    console.log(`Errors:  ${errors}`);
  } catch (e) {
    console.log(e.message);
  }
})();
