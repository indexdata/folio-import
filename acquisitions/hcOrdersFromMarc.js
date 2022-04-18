const fs = require('fs');
const readline = require('readline');
const uuid = require('uuid/v5');
const path = require('path');

const ns = 'a839a191-e230-4c52-8e08-38e3bc5adfc0';

let refDir = process.argv[2];
const inFile = process.argv[3];

const refFiles = {
  organizations: 'organizations.json',
  funds: 'funds.json'
};

(async () => {
  try {
    if (!inFile) throw('Usage: node hcOrders.js <acq_ref_dir> <marc_jsonl_file>');
    if (!fs.existsSync(inFile)) throw new Error(`Can't find ${inFile}!`);
    refDir = refDir.replace(/\/$/, '');
    const fundsMapFile = `${refDir}/funds_map.tsv`;
    if (!fs.existsSync(fundsMapFile)) throw new Error(`Cant't find funds_map.tsv in ${refDir}!`);

    const dir = path.dirname(inFile);
    const fn = path.basename(inFile, '.jsonl', '.json');
    const outFile = `${dir}/folio-${fn}.jsonl`;
    if (fs.existsSync(outFile)) fs.unlinkSync(outFile);

    const refData = {};
    for (let prop in refFiles) {
      refData[prop] = {};
      let path = `${refDir}/${refFiles[prop]}`;
      let obj = require(path);
      console.log(`Mapping ${prop}...`);
      obj[prop].forEach(p => {
        let code = p.code;
        refData[prop][code] = p.id
      })
    }

    const fundsMap = {};
    const fundsTsv = fs.readFileSync(fundsMapFile, { encoding: 'utf8'});
    fundsTsv.split(/\n/).forEach(l => {
      let [code, num] = l.split(/\t/);
      if (code) {
        let numPadded = num.padStart(5, '0');
        fundsMap[numPadded] = refData.funds[code];
      }
    });


    const parseMarc = (marc) => {
      let fo = {};
      marc.fields.forEach(f => {
        for (let tag in f) {
          if (!fo[tag]) fo[tag] = [];
          fo[tag].push(f[tag]);
        }
      });
      return fo;
    }

    const parseField = (field) => {
      let fo = {};
      if (field.subfields) {
        fo.ind1 = field.ind1;
        fo.ind2 = field.ind2;
        field.subfields.forEach(s => {
          for (let c in s) {
            if (!fo[c]) fo[c] = [];
            fo[c].push(s[c]);
          }
        });
      } else {
        fo.data = field;
      }
      return fo;
    }

    const fieldToString = (field, subFieldCode, delimiter) => {
      if (!field) return null;
      let del = (delimiter) ? delimiter : ' ';
      let out;
      let subs = [];
      if (field.subfields) {
        field.subfields.forEach(s => {
          for (let code in s) {
            if (!subFieldCode || subFieldCode.match(code)) subs.push(s[code])
          }
        });
        out = subs.join(del);
      } else {
        out = field[0];
      }
      return out;
    }

    const fileStream = fs.createReadStream(inFile);

    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });

    let c = 0;
    let lnum = 0;
    for await (const line of rl) {
      lnum++;
      try {
        let marc = JSON.parse(line);
        let fields = parseMarc(marc);
        
        let pof = fields['960'][0];
        if (pof) {
          let spo = parseField(pof);
          if (!spo.z) throw(`WARN No order number found in record!`);
          let poNum = spo.z[0].replace(/^..(.+)./, '$1');
          let poId = uuid(poNum, ns); 
          let vcode = (spo.v) ? spo.v[0].trim() : '';
          let orgId = refData.organizations[vcode] || vcode;
          let co = {
            id: poId,
            poNumber: poNum,
            vendor: orgId,
            compositePoLines: [],
            notes: []
          }
          fields['961'].forEach(n => {
            console.log(n);
          });
          
          console.log(co);
          let coStr = JSON.stringify(co) + '\n';
          fs.writeFileSync(outFile, coStr, { flag: 'a' });
          c++;
        }
    


        /*
        let poNum = so.id.toString();
        let poId = uuid(poNum, ns);
        let orgId = refData.organizations[so.vendorRecordCode] || so.vendorRecordCode;
        let co = {
          id: poId,
          poNumber: poNum,
          vendor: orgId,
          dateOrdered: so.orderDate,
          compositePoLines: [],
          notes: []
        }
        let oType = ff['15'].value;
        co.orderType = (oType.match(/[os]/)) ? 'Ongoing' : 'One-Time';
        if (co.orderType === 'Ongoing') {
          co.ongoing = {};
        }
        let pol = {};
        vf.forEach(v => {
          if (v.fieldTag === 's') {
            pol.selector = v.content;
          } else if (v.fieldTag.match(/[invz]/)) {
            co.notes.push(v.content); 
          }
        });
        // co.compositePoLines.push(pol); 
        */
       
      } catch (e) {
        // console.log(`WARN [${lnum}] ${e}`);
        console.log(e);
      }
    }
    console.log('Orders created', c);    
  } catch (e) {
    console.log(e);
  }
})();