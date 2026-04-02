import { parseMarc, fields2mij } from '../js-marc2.mjs';
import fs from 'fs';
import path from 'path';

let rawFile = process.argv[2];

try {
  if (!rawFile) { throw "Usage: node addTest <raw_marc_file>" }

  let start = new Date().valueOf();

  let dir = path.dirname(rawFile);
  let fn = path.basename(rawFile);

  let count = 0;
  const fileStream = fs.createReadStream(rawFile, { encoding: 'utf8' });
  
  let leftOvers = '';
  fileStream.on('data', (chunk) => {
    let recs = chunk.match(/.*?\x1D|.+$/sg);
    recs[0] = leftOvers + recs[0];
    let lastRec = recs[recs.length - 1];
    if (!lastRec.match(/\x1D/)) {
      leftOvers = lastRec;
      recs.pop();
    } else {
      leftOvers = '';
    }
    recs.forEach(r => {
      count++;
      let m = parseMarc(r);
      // console.log(JSON.stringify(m, null, 2));
      // m.addField('245', { ind1: ' ', ind2: ' ', subfields: [{ a: 'HEY'}] });
      // m.addField('992', { ind1: ' ', ind2: ' ', subfields: [{ a: 'THERE'}] });
      let f001 = (m.fields['001']) ? m.fields['001'][0].data : '';
      if (f001) {
        m.deleteField('001', 0);
        m.addField('035', { ind1: ' ', ind2: ' ', subfields: [{a: f001}]});
        m.addField('001', { data: '88888888' });
      }
      // m.deleteField('992', 1);
      let mij = fields2mij(m.fields)
      // console.log(JSON.stringify(mij, null, 2));
    });
  });
  fileStream.on('close', () => {
    let now = new Date().valueOf();
    let t = (now - start) / 1000;
    console.warn('--------------------');
    console.warn('Records processed', count, `${t} secs.`);
  });
} catch (e) {
  console.log(e);
}
