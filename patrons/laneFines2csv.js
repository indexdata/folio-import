const fs = require('fs');
const path = require('path');
const parse = require('csv-parse/lib/sync');
const csvFile = process.argv[2];


(async () => {
  try {
    if (csvFile === undefined) {
      throw('Usage: node laneFines2csv.js <lane_fines_csv_file>');
    }
    if (!fs.existsSync(csvFile)) {
      throw new Error('Can\'t find loans file');
    }

    let workDir = path.dirname(csvFile);

    let csv = fs.readFileSync(csvFile, { encoding: 'utf8'});
    csv = csv.replace(/^\uFEFF/, ''); // remove BOM

    files = {
      out: 'feeFinesRemapped.csv'
    }

    for (let k in files) {
      files[k] = `${workDir}/${files[k]}`;
      if (fs.existsSync(files[k])) fs.unlinkSync(files[k]);
    }

    const inRecs = parse(csv, {
      columns: true,
      skip_empty_lines: true
    });

    const f = [
      'PATRON_BARCODE',
      'ITEM_BARCODE',
      'FINE_FEE_BALANCE',
      'CREATE_DATE',
      'FINE_FEE_DESC',
    ]
    let out = [];
    out.push('userID,itemID,title,dateCreated,amount,remaining,paymentStatus,feeFinetype,feeFineOwner');
    inRecs.forEach(r => {
      line = [];
      f.forEach(fn => {
        if (r[fn].match(/,/)) r[fn] = '"' + fr[fn] + '"';
      });
      let amt = r.FINE_FEE_BALANCE.replace(/(..)$/, '.$1')
      let fft = r.FINE_FEE_DESC;
      line.push(r.PATRON_BARCODE);
      line.push(r.ITEM_BARCODE);
      line.push('');
      line.push(r.CREATE_DATE);
      line.push(amt);
      line.push(amt);
      line.push('Outstanding');
      line.push('Lost item fee');
      line.push('Lane');
      lineStr = line.join(',');
      out.push(lineStr); 
    });
    out.forEach(l => {
      fs.writeFileSync(files.out, l + '\n', { flag: 'a'});
    });
    console.log(`Data saved to ${files.out}.  Use sulFines.js to create FOLIO objects...`);

  } catch (e) {
    console.error(e);
  }
})();
