const uuid = require('uuid/v4');

const inFile = process.argv[2];
const coll = require(inFile);
let root = 'instances';
if (!coll[root]) {
  root = 'holdingsRecords';
} else if (!coll[root]) {
  root = 'items';
}
coll[root].forEach(r => {
  r.id = uuid();
  if (r.hrid) {
    delete r.hrid;
  }
});
console.log(JSON.stringify(coll, null, 2));