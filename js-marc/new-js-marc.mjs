import { Buffer } from 'node:buffer';

export function parseMarc(raw) {
  let record = {};
  let leader = raw.substring(0, 24);

  let dirEnd = parseInt(leader.substring(12, 17), 10);
  let dir = raw.substring(24, dirEnd);
  let dirParts = dir.match(/.{12}/g);
  let mainRec = raw.substring(dirEnd);
  // console.log(mainRec);
  let mij = {
    leader: leader,
    fields: []
  };
  let fields = {
    leader: leader,
  };
  let df = mainRec.split(/\x1E/);
  df.pop();
  dirParts.forEach((d, i) => {
    let p = d.match(/^(.{3})(.{4})(.{5})/);
    let tag = p[1];
    let data = df[i];
    let obj = {};
    if (!fields[tag]) fields[tag] = [];
    if (tag > '009') {
      obj.ind1 = data.substring(0, 1);
      obj.ind2 = data.substring(1, 2);
      let subs = data.split(/\x1F/);
      subs.shift();
      obj.subfields = [];
      subs.forEach(s => {
        let code = s.substring(0, 1);
        let data = s.substring(1);
        let sub = { [code]: data };
        obj.subfields.push(sub);
      });
      mij.fields.push({ [tag]: obj });
      fields[tag].push(obj);
    } else {
      mij.fields.push({ [tag]: data });
      fields[tag].push(data);
    }

  });
  record = { mij: mij, fields: fields };
  return record;
}

export function getSubs(field, codes, delim) {
  let dl = (delim) ? delim : ' ';
  let out = [];
  field.subfields.forEach(s => {
    let code = Object.keys(s)[0];
    if (codes.match(code)) {
      out.push(s[code]);
    }
  });
  return out.join(dl);
}

export function makeMarc(data) {
  let line = data.split(/\n/);
  let ldr = '';
  let dir = '';
  let pos = 0;
  let varFields = '';
  line.forEach(l => {
    if (l.match(/^\d{3} /)) {
      let tag = l.substring(0, 3);
      let data = l.substring(4);
      if (tag > '009') {
        data = data.replace(/ \$(.) */g, '\x1F$1');
      }
      data += '\x1E';
      varFields += data;
      let len = Buffer.byteLength(data, 'utf8');
      let lenStr = len.toString().padStart(4, '0');
      let posStr = pos.toString().padStart(5, '0');
      let dirPart = tag + lenStr + posStr;
      dir += dirPart;
      pos += len;
    } else if (l.match(/^\d{5}/)) {
      ldr = l.substring(5);
    }
  });
  dir += '\x1E';
  let base = dir.length + 24;
  let baseStr = base.toString().padStart(5, '0');
  ldr = ldr.replace(/^(.{7}).{5}/, '$1' + baseStr);
  let rec = ldr + dir + varFields + '\x1D';
  let rlen = rec.length + 5;
  let rlinStr = rlen.toString().padStart(5, '0');
  rec = rlinStr + rec;
  return rec;
}