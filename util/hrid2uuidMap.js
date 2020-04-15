const inst = require(process.argv[2]);

const out = {};
inst.instances.forEach(i => {
  out[i.hrid] = i.id;
});
console.log(JSON.stringify(out, null, 2));
