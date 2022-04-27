const fs = require('fs');
const readline = require('readline');
const uuid = require('uuid/v5');
const path = require('path');

const ns = 'e35dff4e-9035-4d6a-b621-3d42578f81c7';
const nullns = '00000000-0000-0000-0000-000000000000';

let refDir = process.argv[2];
const inFile = process.argv[3];

const refFiles = {
  organizations: 'organizations.json',
  funds: 'funds.json',
  batchGroups: 'batch-groups.json'
};

(async () => {
  try {
    if (!inFile) throw('Usage: node hcInvoices.js <acq_ref_dir> <sierra_invoices_json_file>');
    if (!fs.existsSync(inFile)) throw new Error(`Can't find ${inFile}!`);
    refDir = refDir.replace(/\/$/, '');

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
        let code = p.code || p.name;
        refData[prop][code] = p.id;
      })
    }

    const fileStream = fs.createReadStream(inFile);

    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });

    let c = 0;
    let lnum = 0;
    let fail = 0;
    for await (const line of rl) {
      lnum++;
      try {
        let so = JSON.parse(line);
        let sid = so.id.toString();
        let iv = {
          id: uuid(sid, ns),
          batchGroupId: refData.batchGroups.FOLIO,
          currency: 'USD',
          invoiceDate: so.invDate
        };
        
    
        console.log(JSON.stringify(iv, null, 2));
        let ivStr = JSON.stringify(iv) + '\n';
        fs.writeFileSync(outFile, ivStr, { flag: 'a' });
        c++;
      } catch (e) {
        console.log(`[${lnum}] ${e}`);
        fail++;
      }
    }
    console.log('Created', c);
    console.log('Failed', fail);
    console.log('Saved to:', outFile);
  } catch (e) {
    console.log(e);
  }
})();