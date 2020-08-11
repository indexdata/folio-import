const fs = require('fs');

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
  if (!r.metadata) {
    r.metadata = {
      createdDate: cDate
    };
  }
  console.log(r);
});