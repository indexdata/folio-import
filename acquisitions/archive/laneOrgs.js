const parse = require('csv-parse/lib/sync');
const fs = require('fs');
const uuid = require('uuid/v5');
const path = require('path');

const refDir = process.argv[2];
const inFile = process.argv[3];
const ns = 'cdea119e-433b-4c31-9fff-4a4f0ad72cfd';
const unit = 'Lane';
const user = '5ba3f53b-fec0-455e-97e1-50b3471fa7bb';

try {
  if (!inFile) throw(`Usage: node laneOrgs <ref_dir> <organizations_csv_file>`);

  const dir = path.dirname(inFile);
  const fn = path.basename(inFile, '.csv', '.txt');
  const outFile = `${dir}/${fn}.jsonl`;
  if (fs.existsSync(outFile)) fs.unlinkSync(outFile);
  let csv = fs.readFileSync(`${inFile}`, 'utf8');
  csv = csv.replace(/^\uFEFF/, ''); // remove BOM
  const inRecs = parse(csv, {
    columns: true,
    skip_empty_lines: true,
    from: 1
  });

  const units = require(`${refDir}/units.json`);
  let unitId = '';
  units.acquisitionsUnits.forEach(u => {
    if (u.name === unit) {
      unitId = u.id;
    }
  });

  const seen = {};
  let c = 0;
  inRecs.forEach(r => {
    // console.log(r);
    let code = r.VENDOR_CODE;
    let org = {
      id: uuid(code, ns),
      code: code + '-Lane',
      name: r.VENDOR_NAME,
      status: 'Active',
      acqUnitIds: [ unitId ],
      isVendor: true,
      erpCode: r['Accounting Code'],
    }
    if (r.Description) org.description = 'Create Date: ' + r.Description;
    if (!seen[code]) {
      fs.writeFileSync(outFile, JSON.stringify(org) + '\n', { flag: 'a' });
    } else {
      console.log(`WARN Duplicate code "${code}`);
    }
    seen[r.Code] = 1;
    c++;
  });
  console.log('Finished!');
  console.log('Organizations created:', c);
  console.log(`Saved to ${outFile}`);
} catch (e) {
  console.log(e);
}
