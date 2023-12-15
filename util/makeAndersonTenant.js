const uuid = require('uuid/v5');
const fs = require('fs');

const ns = '39f8571b-bf15-4999-9bcc-7a70af201bd4';

const tsvDir = process.argv[2];

const tfiles = {
  sp: 'service-points.tsv',
  inst: 'institutions.tsv',
  camp: 'campuses.tsv',
  lib: 'libraries.tsv',
  loc: 'locations.tsv'
};

try {
  if (!tsvDir) {
    throw 'Usage: node makeScuTenent.js <tsv_file_dir>';
  }

  let dir = tsvDir.replace(/\/$/, '');

  let spId = {};
  let instId;
  let campId;
  let libIds = {};
  for (let t in tfiles) {
    let tf = dir + '/' + tfiles[t];
    let sf = tf.replace(/\.tsv$/, '.jsonl');
    if (fs.existsSync(sf)) fs.unlinkSync(sf);
    
    console.log('Reading', tf);

    let tdata = fs.readFileSync(tf, { encoding: 'utf8' });
    let lines = tdata.split(/\n/);
    lines.shift();
    const lseen = {};
    lines.forEach(l => {
      let o = {};
      l = l.trim();
      let c = l.split(/\t/);
      let doWrite = true;

      if (t === 'sp') {
        spId[c[1]] = uuid(c[1], ns);
        o.id = spId[c[1]];
        o.code = c[1];
        o.name = c[2];
        o.discoveryDisplayName = c[2];
      } else if (t === 'inst') {
        instId = uuid(c[1], ns);
        o.id = instId;
        o.name = c[2];
        o.code = c[1];
      } else if (t === 'camp') {
        campId = uuid(c[1], ns);
        o.id = campId;
        o.name = c[2];
        o.code = c[1];
        o.institutionId = instId;
      } else if (t === 'lib') {
        libIds[c[0]] = uuid(c[1], ns);
        o.id = libIds[c[0]];
        o.name = c[2];
        o.code = c[1];
        o.campusId = campId;
      } else if (t === 'loc') {
        let locId = uuid(c[2], ns);
        let sp =  spId[c[4]];
        o.id = locId;
        o.name = c[3];
        o.code = c[2];
        o.campusId = campId;
        o.libraryId = libIds[c[0]];
        o.institutionId = instId;
        o.servicePointIds = [ sp ];
        o.primaryServicePoint = sp;
        o.isActive = true;
        o.discoveryDisplayName = c[3];
        if (!lseen[c[2]]) lseen[c[2]] = 0;
        lseen[c[2]]++;
      } 
      if (!lseen[c[2]] || lseen[c[2]] === 1) fs.writeFileSync(sf, JSON.stringify(o) + '\n', {flag:'a'});
    });
  }

} catch (e) {
  console.error(e);
}