const fs = require('fs');
const readline = require('readline');
const path = require('path');
const uuid = require('uuid/v5');

const itemFile = process.argv[2];

const files = {
  items: 'fixed.jsonl',
};

const gnt = '7a46e1ca-d2eb-49a3-9935-59bed639e6f1';
const nnt = '8d0a5eca-25de-4391-81a9-236eeefdd20b';

(async () => {
  try {
    if (!itemFile) throw(`Usage: node googl-notes-fix.js <sierra-item-file.jsonl>`);

    const startTime = new Date().valueOf();

    const writeJSON = (fn, data) => {
      const out = JSON.stringify(data) + "\n";
      fs.writeFileSync(fn, out, { flag: 'a' });
    }

    const noteGen = (note, type, staffOnly) => {
      let out = {
        note: note,
        itemNoteTypeId: type
      }
      out.staffOnly = (staffOnly) ? true : false;
      return out;
    }

    let dir = path.dirname(itemFile);
    let base = path.basename(itemFile, '.jsonl');

    for (let f in files) {
      let fullPath = dir + '/' + base + '-' + files[f];
      if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
      files[f] = fullPath;
    }

    // get instance map
    console.log('Making instance map...')
    let instMap = {}
    let fileStream = fs.createReadStream(itemFile);
    let rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });
    for await (let line of rl) {
      let i = JSON.parse(line);
      let hrid = 'i' + i.id;
      let ff = i.fixedFields;
      let vf = {};
      let notes = [];
      i.varFields.forEach(f => {
        if (!vf[f.fieldTag]) vf[f.fieldTag] = [];
        vf[f.fieldTag].push(f.content);
      });
      let icode = ff['59'].value;
      let obj = {
        hrid: hrid,
      }
      if (icode === '7781' && vf.x) {
        vf.x.forEach(x => {
          let n = {
            note: x,
            itemNoteTypeId: gnt
          };
          notes.push(n);
        })
      }
      obj.notes = notes;
      console.log(obj);
    }
  } catch (e) {
    console.log(e);
  }
})();
