const fs = require('fs');
const readline = require('readline');
let inFile = process.argv[3];
let mrFile = process.argv[2];
let schemaFile = './schemas/instance.json';

const getFields = (rec => {
  let tags = [];
  let out = {};
  rec.fields.forEach(f => {
    for (let t in f) {
      if (!out[t]) out[t] = [];
      out[t].push(f[t]);
    }
  });
  return out;
});

const getSubs = ((field, code, delimiter) => {
  let data = [];
  dlim = delimiter || ' ';
  if (field.subfields) {
    field.subfields.forEach(s => {
      for (let c in s) {
        if (!code || code.match(c)) {
          data.push(s[c]);
        }
      }
    });
    return data.join(dlim);
  } else {
    return field;
  }
});

const processRec = ((rec, mr, schema, validTags) => {
  const fields = getFields(rec);
  let inst = {};
  for (let tag in fields) {
    if (validTags[tag]) {
      let maps = mr[tag];
      fields[tag].forEach(f => {
        let thing = {};
        let thingProp;
        maps.forEach(m => {
          if (m.target) {
            let sfStr = (m.subfield) ? m.subfield.join('') : '';
            let [ prop, subProp ] = m.target.split('.');
            let data = getSubs(f, sfStr);
            if (schema[prop] === 'string') {
              inst[prop] = data;
            } else if (schema[prop] === 'array.string') {
              if (!inst[prop]) inst[prop] = [];
              inst[prop].push(data);
            } else if (schema[prop].match(/object/)) {
              thingProp = prop;
              thing[subProp] = data;
            }
          }
        });
        if (thingProp) {
          if (schema[thingProp] === 'array.object') {
            if (!inst[thingProp]) inst[thingProp] = [];
            inst[thingProp].push(thing);
          } else {
            inst[thingProp] = thing;
          }
        }
      });
    }
  }
  return inst;
});


(async () => {
  try {
    let inData;
    if (!inFile) {
      throw new Error('Usage: node marc2inst.js <mapping_rules> <marc_in_json_file>');
    } else if (!fs.existsSync(inFile)) {
      throw new Error('Can\'t find input file');
    } else if (!fs.existsSync(mrFile)) {
      throw new Error('Can\'t find mapping file');
    } else if (!fs.existsSync(schemaFile)) {
      throw new Error(`Can't find schema at ${schemaFile}`);
    }

    let mr = require(mrFile);
    let validTags = {};
    for (let k in mr) {
      validTags[k] = 1;
    }

    let schemaObj = require(schemaFile);
    let schema = {};
    let props = schemaObj.properties;
    for (let k in props) {
      let type = props[k].type;
      let final = type;
      if (type === 'array') {
        final = `${final}.${props[k].items.type}`;
      }
      schema[k] = final;
    }

    const fileStream = fs.createReadStream(inFile);
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });
    let start = new Date().valueOf();
    let mij;
    let count = 0;
    for await (const line of rl) {
      if (line.match(/^{$/)) {
        mij = '{';
      } else if (line.match(/^}$/)) {
        mij += '}';
        let rec = JSON.parse(mij);
        count++;
        if (count % 10000 === 0) {
          console.log('Records processed:', count);
        }
        let inst = processRec(rec, mr, schema, validTags);
        // console.log(inst);
      } else {
        mij += line;
      }
    }
    const end = new Date().valueOf();
    const tt = (end - start) / 1000;
    console.log('Total recs:', count);
    console.log('Total time:', tt); 
  } catch (e) {
    console.log(e);
  }
})();
