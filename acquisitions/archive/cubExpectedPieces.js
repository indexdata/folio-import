/*
  1. You'll need to download all order titles from /orders-storage/titles and save in JSON line format (use downloadJSONL.js to do this.)
  2. Alos download all PO lines from /orders-storage/po-lines and save in JSON line format (use downloadJSONL.js.);
*/

const fs = require('fs');
const uuid = require('uuid/v5');
const path = require('path');
const parse = require('csv-parse/lib/sync');
const readline = require('readline');

const ns = 'ab723459-0c16-4be6-a097-a72079d02479';
const nons = '00000000-0000-0000-0000-000000000000';
const version = '1';
const isil = 'CU';

const inFile = process.argv[5];
const folioPiecesFile = process.argv[4];
const titlesFile = process.argv[3];
const poLineFile = process.argv[2];

(async () => {
  try {
    let start = new Date().valueOf();
    if (!inFile) throw('Usage: node cubExpectedPieces.js <polines_jsonl_file> <titles_jsonl_file> <downloaded_pieces_file> <expected_csv_file>');
    if (!fs.existsSync(inFile)) throw new Error(`Can't find ${inFile}!`);
    
    const dir = path.dirname(inFile);
    const fn = path.basename(inFile, '.csv');
    const outFile = `${dir}/pieces.jsonl`;
    if (fs.existsSync(outFile)) fs.unlinkSync(outFile);

    let fileStream = fs.createReadStream(poLineFile);
    let rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });
    
    console.log('Mapping PO Lines...');
    let lineMap = {};
    for await (const line of rl) {
      let rec = JSON.parse(line);
      let key = rec.poLineNumber;
      lineMap[key] = rec;
    }

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

    fileStream = fs.createReadStream(folioPiecesFile);
    rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });

    console.log('Loading folio pieces...');
    let pieceMap = {};
    for await (const line of rl) {
      let rec = JSON.parse(line);
      let key = (rec.enumeration) ? rec.poLineId + rec.enumeration : '0';
      key = key.toLowerCase();
      pieceMap[key] = 1;
    }

    let c = 0;
    let fail = 0;

    let csv = fs.readFileSync(inFile, 'utf8');
    let inRecs = parse(csv, {
      columns: true,
      skip_empty_lines: true,
      bom: true
    });
    let curLink;
    inRecs.forEach(p => {
      let link = p['POL Number'];
      if (link) {
        curLink = link;
      } else {
        link = curLink;
      }
      if (lineMap[link]) {
        let poLineId = lineMap[link].id;
        let format = lineMap[link].orderFormat.replace(/ .+/, '');
        let rdate = '';
        let indate = p['Expected Receipt Date'];
        let edate = new Date(indate).toISOString();
        // edate = edate.replace(/Z.*/, '-12:00');
        let enu = p.Enumeration;
        let com = p.Comment;
        let titleId = titleMap[poLineId];
        let locs = lineMap[link].locations;
        if (!poLineId) console.log(`WARN No title found for (${link})`);
        if (!titleId) console.log(`WARN No title found for ${poLineId} (${link})`);
        let matchKey = poLineId + enu;
        matchKey = matchKey.toLowerCase();
        if (poLineId && titleId) {
          let piece = {
            id: uuid(poLineId + enu + edate + format, ns),
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
          if (enu) piece.enumeration = enu;
          if (com) piece.comment = com;
          if (locs) {
            piece.locationId = locs[0].locationId
          }
          if (!pieceMap[matchKey]) {
            fs.writeFileSync(outFile, JSON.stringify(piece) + '\n', { flag: 'a' });
            c++;
          } else {
            console.log(`INFO enumeration (${enu}) already exists for ${link}...`);
          }
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