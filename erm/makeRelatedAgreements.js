/*
  Since the agreements module is crap and we can't assign predetermined ids to anything, it is impossible to create related
  agreements before loading agreements sans relationships.
 
  Required: 1) relationships.jsonl (output by the agreements maker).
  2) agreementsOut.jsonl (this is the record returned by FOLIO with actual uuids)
*/

const fs = require('fs');
const path = require('path');
const readline = require('readline');

let dir = process.argv[2];

const files = {
  rel: 'relationships.jsonl',
  out: 'agreementsOut.jsonl'
};

(async () => {
  try {
    if (!dir) throw('Usage: node makeRelatedAgreements.js <agreements_dir>');
    
    dir = dir.replace(/\\$/, '');
    const outFile = `${dir}/agreements-reload.jsonl`;
    if (fs.existsSync(outFile)) fs.unlinkSync(outFile);

    for (let f in files) {
      files[f] = dir + '/' + files[f];
    }
    // console.log(files); return;

    let e = 0;
    let outRecs = [];
    let fileStream = fs.createReadStream(files.out);
    let rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });

    const nameMap = {};
    for await (const line of rl) {
      let j = JSON.parse(line);
      nameMap[j.name] = j.id;
      outRecs.push(j);
    }
    // console.log(nameMap); return;

    fileStream = fs.createReadStream(files.rel);
    rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });

    const relMap = {};
    let rc = 0;
    let rtype;
    for await (const line of rl) {
      let j = JSON.parse(line);
      let outId = nameMap[j.id];
      let relId = nameMap[j.rid];
      if (outId && relId) { 
        relMap[outId] = relId;
        rc++;
        rtype = j.type;
      } else {
        console.log('ERROR Not found:', j.id, '->', j.rid);
        e++
      }
    }
    // console.log('Relationships Mapped', rc); return
    // console.log(relMap); return;

    let c = 0;
    outRecs.forEach(r => {
      let id = r.id;
      let relId = relMap[id];
      if (relId) {
        let o = {
          _delete: false,
          inward: relId,
          type: rtype
        }
        if (!r.outwardRelationships) r.outwardRelationships = [];
        r.outwardRelationships.push(o);
        fs.writeFileSync(outFile, JSON.stringify(r) + '\n', { flag: 'a' });
        c++;
      }
    });
    console.log('Update agreements created:', c);
    console.log('Saved to:', outFile);
    console.log('Errors:', e);
  } catch (e) {
    console.error(e);
  }
})();