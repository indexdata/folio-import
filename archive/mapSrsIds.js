const fs = require('fs');
const superagent = require('superagent');
const { getAuthToken } = require('./lib/login');

const wait = (ms) => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

const getMijField = (record, tag, sf) => {
  let data = null;
  let fields = record.parsedRecord.content.fields.filter(f => f[tag]);
  fields.forEach(f => {
    if (f[tag].subfields) {
      f[tag].subfields.forEach(s => {
        if (s[sf]) {
          data = s[sf];
        }
      });
    } else {
      data = f[tag];
    }
  });
  return data;
};

(async () => {
  try {
    let batDir = process.argv[3];
    let controlNum = process.argv[2];
    let cn = controlNum.replace(/[a-z]$/, '');
    let sf = controlNum.replace(/^.../, '');
    files = [];
    if (!batDir) {
      throw new Error('Usage: node mapSrsIds.js <control_num_tag> <batch_directory>');
    } else if (!fs.existsSync(batDir)) {
      throw new Error('Can\'t find batch directory');
    } else {
      files = fs.readdirSync(batDir);
    }
    batDir = batDir.replace(/\/$/, '');
    const config = (fs.existsSync('./config.js')) ? require('./config.js') : require('./config.default.js');
    const authToken = await getAuthToken(superagent, config.okapi, config.tenant, config.authpath, config.username, config.password);
    for (let x = 0; x < files.length; x++) {
      if (files[x].match(/_snap.json$/)) {
        let snapPath = `${batDir}/${files[x]}`;
        let snapObj = JSON.parse(fs.readFileSync(snapPath, 'utf8'));
        try {
          const actionUrl = `${config.okapi}/source-storage/sourceRecords?query=snapshotId=${snapObj.jobExecutionId}&limit=1000`;
          const idMap = {};
          const res = await superagent
            .get(`${actionUrl}`)
            .set('accept', 'application/json')
            .set('x-okapi-tenant', config.tenant)
            .set('x-okapi-token', authToken)
          for (let x = 0; x < res.body.sourceRecords.length; x++) {
            let r = res.body.sourceRecords[x];
            let uuid = getMijField(r, '999', 'i', 'f');
            let locId = getMijField(r, cn, sf);
            if (locId) {
              idMap[locId] = uuid;
            }
          }
          let mapPath = snapPath.replace(/_snap.json$/, '_map.json');
          let mapString = JSON.stringify(idMap, null, 2);
          fs.writeFileSync(mapPath, mapString);
          console.log(idMap);
        } catch (e) {
          console.error(e.message);
        }
      }
    }
  } catch (e) {
    console.error(e.message);
  }
})();
