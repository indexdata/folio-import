/*
  1. You'll need to download all order titles from /orders-storage/titles and save in JSON line format (use downloadJSONL.js to do this.)
  2. A file named piece-map.jsonl should be in the same directory as the pieces CSV file.  The laneOrders.js script will create this file.
*/

const fs = require('fs');
const uuid = require('uuid/v5');
const path = require('path');
const parse = require('csv-parse/lib/sync');
const readline = require('readline');

const ns = '72132a0f-e27c-4462-8b30-4f9dafe1f710';

const inFile = process.argv[3];
const titlesFile = process.argv[2];

(async () => {
  try {
    let start = new Date().valueOf();
    if (!inFile) throw('Usage: node scuPieces.js <titles.jsonl_file> <pieces.csv_file>');
    if (!fs.existsSync(inFile)) throw new Error(`Can't find ${inFile}!`);
    
    const dir = path.dirname(inFile);
    const outFile = `${dir}/pieces.jsonl`;
    if (fs.existsSync(outFile)) fs.unlinkSync(outFile);

    /*
    const mapFile = `${dir}/piece-map.jsonl`;

    let fileStream = fs.createReadStream(mapFile);
    let rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });
    
    console.log('Loading piece map...');
    let lineMap = {};
    for await (const line of rl) {
      let rec = JSON.parse(line);
      let key = Object.keys(rec)[0];
      lineMap[key] = rec[key];
    }
    // console.log(lineMap); return;
    */

    fileStream = fs.createReadStream(titlesFile);
    rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });

    let lineCount = 0;
    console.log('Loading titles...');
    let titleMap = {};
    for await (const line of rl) {
      let rec = JSON.parse(line);
      let key = rec.poLineId;
      titleMap[key] = rec.id;
    }

    let c = 0;
    let fail = 0;

    let csv = fs.readFileSync(inFile, 'utf8');
    csv = csv.replace(/\uFEFF/g, ''); // remove BOM
    let inRecs = parse(csv, {
      columns: true,
      skip_empty_lines: true,
      bom: true
    });
    inRecs.forEach(p => {
      console.log(p);
      let polNum = p['POL*'];
      if (polNum) {
        let poLineId = uuid(polNum, ns);
        let format = p['Format*'];
        let rd = p.RECEIPT_DATE;
        let ed = p.EXPECTED_DATE;
        let rdate = (rd) ? new Date(rd).toISOString() : '';
        let edate = (ed) ? new Date(ed).toISOString() : '';
        let en = p.Enumeration || ''; 
        let cr = p.Chronology || '';
        let titleId = titleMap[poLineId];
        if (!poLineId) console.log(`WARN No title found for (${polNum})`);
        if (!titleId) console.log(`WARN No title found for ${poLineId} (${polNum})`);
        if (poLineId && titleId) {
          let piece = {
            id: uuid(poLineId + en + cr + rdate + edate + format, ns),
            poLineId: poLineId,
            format: format,
            titleId: titleId
          }
          if (rdate.match(/\d/)) {
            piece.receivingStatus = 'Received';
            piece.receivedDate = rdate;
          } else {
            piece.receivingStatus = 'Expected';
            piece.receiptDate = edate;
          }
          if (en) {
            piece.enumeration = en.trim();
          }
          if (cr) {
            piece.chronology = cr.trim();
          }
          fs.writeFileSync(outFile, JSON.stringify(piece) + '\n', { flag: 'a' });
          c++;
        } else {
          fail++;
        }
      } else {
        console.log(`WARN ${link} not found in lineMap!`);
      }
    });
    
    let end = new Date().valueOf();
    let tt = (end - start) / 1000;
    console.log('Pieces created', c);
    console.log('Failures', fail);
    console.log('Time (secs)', tt);
  } catch (e) {
    console.error(e);
  }
})();