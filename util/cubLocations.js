const fs = require('fs');

const flocsFile = process.argv[2];
const slocsFile = process.argv[3];
const lmapFile = process.argv[4];

(async () => {

try {
  if (!lmapFile) throw(`Usage node cubLocations.js <folio_locations_json> <sierra_location_codes_file> <location_map_tsv>`);
  const lmapData = fs.readFileSync(lmapFile, { encoding: 'utf8'});
  const slocsData = fs.readFileSync(slocsFile, { encoding: 'utf8'});

  const flocs = require(flocsFile);
  fmap = {};
  flocs.locations.forEach(l => {
    fmap[l.code] = { name: l.name, code: l.code, id: l.id };
  });

  lmap = {};
  lmapData.split(/\n/).forEach(l => {
    let [key, val] = l.split(/\t/);
    val = val.replace(/^.+\//, '');
    if (key) lmap[key] = val;
  });
  
  const lseen = {};
  slocsData.split(/\n/).forEach(l => {
    l = l.trim();
    let lcode = lmap[l];
    if (!lseen[l]) {
      let name = (fmap[lcode]) ? fmap[lcode].name : '-';
      let code = (fmap[lcode]) ? fmap[lcode].code : '-';
      let id = (fmap[lcode]) ? fmap[lcode].id : '-';
      if (l) console.log(l + '\t' + name + '\t' + code + '\t' + id);
      lseen[l] = 1;
    }
  });

} catch (e) {
  console.log(e);
}

})();

