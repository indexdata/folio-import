const fs = require('fs');
const readline = require('readline');
const uuid = require('uuid/v5');
const path = require('path');

const ns = 'e35dff4e-9035-4d6a-b621-3d42578f81c7';

let refDir = process.argv[2];
const inFile = process.argv[3];

const refFiles = {
  organizations: 'organizations.json',
  funds: 'funds.json'
};

(async () => {
  try {
    if (!inFile) throw('Usage: node hcOrders.js <acq_ref_dir> <sierra_orders_json_file>');
    if (!fs.existsSync(inFile)) throw new Error(`Can't find ${inFile}!`);
    refDir = refDir.replace(/\/$/, '');
    const fundsMapFile = `${refDir}/funds_map.tsv`;
    if (!fs.existsSync(fundsMapFile)) throw new Error(`Cant't find funds_map.tsv in ${refDir}!`);

    const dir = path.dirname(inFile);
    const fn = path.basename(inFile, '.jsonl');
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
        let so = JSON.parse(line);
        let vf = (so.varFields) ? so.varFields : [];
        let ff = so.fixedFields;
        let poNum = so.id.toString();
        let poId = uuid(poNum, ns);
        let vcode = ff['22'].value || '';
        vcode = vcode.trim();
        let orgId = refData.organizations[vcode] || vcode;
        let co = {
          id: poId,
          poNumber: poNum,
          vendor: orgId,
          dateOrdered: ff['13'].value,
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
          } else if (v.fieldTag.match(/[nz]/)) {
            co.notes.push(v.content); 
          }
        });
        // co.compositePoLines.push(pol);
        console.log(co);
        let coStr = JSON.stringify(co) + '\n';
        fs.writeFileSync(outFile, coStr, { flag: 'a' });
        c++;
      } catch (e) {
        console.log(`WARN [${lnum}] ${e}`);
      }
    }
    console.log('Orders created', c);    
  } catch (e) {
    console.log(e);
  }
})();