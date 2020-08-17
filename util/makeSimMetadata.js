const fs = require('fs');

const userId = 'b8e68b41-5473-5d0c-85c8-f4c4eb391b59';
const userName = 'sim_admin';

const mfile = process.argv[2];
const ifile = process.argv[3];
let recs = require(ifile);
let mapData = fs.readFileSync(mfile, 'utf8');
let mapLines = mapData.split(/\n/);
mapData = null;
mapLines.pop();
let iMap = {};
mapLines.forEach(l => {
  let kv = l.split(/\|/);
  iMap[kv[0]] = { created: kv[1] };
  if (kv[2]) iMap[kv[0]].updated = kv[2];
});
mapLines = [];
recs.items.forEach(r => {
  let cDate = iMap[r.hrid].created;
  if (cDate) {
    if (cDate.match(/^[0-2]/)) {
      cDate = '20' + cDate;
    } else {
      cDate = '19' + cDate;
    }
    cDate = cDate.replace(/(....)(..)(..)/, '$1-$2-$3T12:00:00+0000');
    uDate = '2020-06-01T12:00:00+0000';
    if (!r.metadata) {
      r.metadata = {
        createdDate: cDate,
        createdByUserId: userId,
        createdByUsername: userName,
        updatedDate: uDate,
        updatedByUserId: userId,
        updatedByUsername: userName
      };
    }
  }
});
const jsonOut = JSON.stringify(recs, null, 2);
console.log(jsonOut);