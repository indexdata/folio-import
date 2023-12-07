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
  console.log(data);
}