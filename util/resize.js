// Usage: node resize.js <filename> <size> [<root_property>]

const inFile = process.argv[2];
const size = process.argv[3];
const root = process.argv[4];

const inData = require(`./${inFile}`);
let records = [];
if (root) {
  records = inData[root].splice(0, size);
} else {
  records = inData.splice(0, size);
}
var outData;
if (root) {
  outData = {};
  outData[root] = records;
} else {
  outData = records;
}
let out = JSON.stringify(outData, null, 2);

console.log(out);
