import { Buffer } from 'node:buffer';

/**
 * Parse raw a MARC record into JSON
 * @param {binary} raw
 * @param {boolean} txt
 * @returns {Object} a record object with "mij", "fields" objects and optional text rendering
 */
export function parseMarc(raw, txt) {
  try {
    let record = {};
    let leader = raw.substring(0, 24);
    let dirEnd = parseInt(leader.substring(12, 17), 10);
    let dir = raw.substring(24, dirEnd);
    let dirParts = dir.match(/.{12}/g);
    let mij = {
      leader: leader,
      fields: [],
    };
    let fields = {
      leader: leader,
    };
    let lines = (txt) ? [ leader ] : [];
    let buf = Buffer.from(raw);
    dirParts.forEach(d => {
      let p = d.match(/^(.{3})(.{4})(.{5})/);
      let tag = p[1];
      let len = parseInt(p[2], 10) - 1;
      let start = parseInt(p[3], 10) + dirEnd;
      let end = start + len;
      let obj = {};
      let data = buf.subarray(start, end).toString();
      if (!fields[tag]) fields[tag] = [];
      if (data.match(/\x1F/)) {
        obj.ind1 = data.substring(0, 1).replace(/\W/, ' ');
        obj.ind2 = data.substring(1, 2).replace(/\W/, ' ');
        let subs = data.split(/\x1F/);
        subs.shift();
        obj.subfields = [];
        let sparts = (txt) ? [ `${tag} ${obj.ind1}${obj.ind2}`] : [];
        subs.forEach(s => {
          let code = s.substring(0, 1);
          let data = s.substring(1);
          if (code) obj.subfields.push({ [code]: data });
          if (txt) {
            sparts.push(`${code} ${data}`);
          }
        });
        mij.fields.push({ [tag]: obj });
        fields[tag].push(obj);
        if (txt) {
          lines.push(sparts.join(' '));
        }

      } else {
        mij.fields.push({ [tag]: data });
        fields[tag].push(data);
        if (txt) {
          lines.push(`${tag} ${data}`);
        }
      }
    });
    record = {
      mij: mij,
      fields: fields,
      text: lines.join('\n'),
      deleteField: (tag, occurance) => {
        if (fields[tag]) {
          fields[tag].splice(occurance, 1);
        } 
        mij.fields.forEach((f, i) => {
          let o = 0;
          if (f[tag] && o === occurance) {
            mij.fields.splice(i, 1);
            o++;
          }
        });
      },
      addField: (tag, data) => {
        mij.fields.push({[tag]: data});
        if (!fields[tag]) fields[tag] = [];
        fields[tag].push(data);
      },
      updateField: (tag, data, occurance) => {
        let o = (occurance === undefined) ? 0 : occurance;
        if (fields[tag]) {
          if (fields[tag][o]) {
            fields[tag][o] = data;
          }
          mij.fields.forEach((f) => {
            let ctag = Object.keys(f)[0];
            if (ctag === tag) {
              f[tag] = data;
            }
          });
        }
      }
    };
    
    return record;
  } catch(e) {
    throw new Error(e);
  }
}

/**
 * Get a string or array representation from a field object
 * @param {Object} field - A field object as returned by parseMarc
 * @param {string} codes - Subfield codes to return
 * @param {string|number} [ delim= ] - An optional join character (default: " "), set to -1 to return an array
 * @returns {string|array}
 */
export function getSubs(field, codes, delim) {
  let dl = (delim) ? delim : ' ';
  let out = [];
  if (!field || !field.subfields) return;
  field.subfields.forEach(s => {
    let code = Object.keys(s)[0];
    if (!codes) {
      out.push(s[code]);
    } else if (code.match(/\w/) && codes.match(code)) {
      out.push(s[code]);
    }
  });
  if (dl === -1) {
    return out;
  } else {
    return out.join(dl);
  }
}

export function getSubsHash(field, returnString) {
  const out = {};
  field.subfields.forEach(s => {
    let code = Object.keys(s)[0];
    if (code.match(/\w/)) {
      if (returnString) {
        if (!out[code]) out[code] = s[code];
      } else {
        if (!out[code]) out[code] = [];
        out[code].push(s[code]);
      }
    }
  });
  return out;
}

export function fields2mij(fields) {
  let tags = Object.keys(fields).sort();
  const mij = { fields: [] };
  tags.forEach(t => {
    if (t.match(/\d{3}/)) {
      fields[t].forEach(f => {
        mij.fields.push({ [t]: f});
      });
    }
  });
  mij.leader = fields.leader;
  return mij;
}

/**
 * Create a raw MARC record from MIJ
 * @param {Object} mij - MARC in JSON record
 * @param {Boolean} sortFieldsByTag - Sort fields by tag name
 * @returns {binary}
 */
export function mij2raw(mij, sortFieldsByTag) {
  let dir = '';
  let pos = 0;
  let varFields = '';
  if (sortFieldsByTag) mij.fields.sort((a, b) => Object.keys(a)[0] - Object.keys(b)[0]);
  mij.fields.forEach(f => {
    let tag = Object.keys(f)[0];
    let data = '';
    if (f[tag].subfields) {
      let d = f[tag];
      d.subfields.forEach(s => {
        let code = Object.keys(s)[0];
        let sd = s[code];
        data += d.ind1 + d.ind2 + '\x1F' + code + sd;
      });
    } else {
      data = f[tag];
    }
    data += '\x1E';
    varFields += data;
    let len = Buffer.byteLength(data, 'utf8');
    let lenStr = len.toString().padStart(4, '0');
    let posStr = pos.toString().padStart(5, '0');
    let dirPart = tag + lenStr + posStr;
    dir += dirPart;
    pos += len;
  });
  let ldr = mij.leader;
  dir += '\x1E';
  let base = dir.length + 24;
  let baseStr = base.toString().padStart(5, '0');
  ldr = ldr.replace(/^\d{5}(.{7})\d{5}(.+)/, '$1' + baseStr + '$2');
  let rec = ldr + dir + varFields + '\x1D';
  let rlen = rec.length + 5;
  let rlinStr = rlen.toString().padStart(5, '0');
  rec = rlinStr + rec;
  return { rec: rec, mij: mij };
}

/**
 * Create a raw MARC record from text
 * @param {string} mij - Yaz style text record
 * @returns {binary}
 */
export function txt2raw(data) {
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
      data = data.normalize('NFC');
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
  let rlen = Buffer.byteLength(rec, 'utf8') + 5;
  let rlinStr = rlen.toString().padStart(5, '0');
  rec = rlinStr + rec;
  return rec;
}