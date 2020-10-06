/*
  This script will take a collection in JSONL format of source records and edit the parsedRecord object 
  via an external script.
*/

const fs = require('fs');
const readline = require('readline');
let inFile = process.argv[3];
let scriptFile = process.argv[2];

const ssId = 'b97e2e2b-72d2-463b-a876-1d9ca4e6a9f0';

(async () => {
  try {
    let inData;
    if (!inFile) {
      throw new Error('Usage: node changeSrsParsedRecord.js <script file> <source_record_collection.jsonl>');
    } else if (!fs.existsSync(inFile)) {
      throw new Error('Can\'t find input file');
    }

    let outFile = inFile.replace(/^(.+)\..*/, '$1_updated.jsonl');
    console.log(`Writing to ${outFile}`);

    const editor = require(scriptFile);
    const fileStream = fs.createReadStream(inFile);
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });

    if (fs.existsSync(outFile)) {
      fs.unlinkSync(outFile);
    }
    
    const seen = {};
    let x = 0;
    for await (const line of rl) {
      x++;
      let rec = JSON.parse(line);
      rec.matchedId = rec.id;
      if (rec.rawRecord) {
	rec.rawRecord.id = rec.id;
      }
      if (rec.parsedRecord) {
	rec.parsedRecord.id = rec.id;
        let instId = rec.externalIdsHolder.instanceId;
        console.log(`# ${x} ${rec.id} (${instId})`);

        rec.generation = 0;
        rec.snapshotId = ssId;
        
        hasNine = false;
        rec.parsedRecord.content.fields.forEach(f => {
          let tag = Object.keys(f)[0];
          if (tag === '999') {
            let subs = f[tag].subfields;
            subs.forEach(s => {
              if (s.s) {
                s.s = ssId;
              }
            });
            hasNine = true;
          }
        });
        if (!hasNine) {
          rec.parsedRecord.content.fields.push({'999': { ind1: 'f', ind2: 'f', subfields: [ { i: instId }, { s: ssId } ] } } )
        }

        let prUpdated = editor(rec.parsedRecord.content);

        if (prUpdated && !seen[instId]) {
          prUpdated.fields.sort((a, b) => {
            aTag = Object.keys(a)[0];
            bTag = Object.keys(b)[0];
            if (aTag < bTag) return -1;
            else if (bTag > bTag) return 1;
            else return 0;
          });

          rec.parsedRecord.content = prUpdated;
          let out = JSON.stringify(rec) + '\n';
          fs.writeFileSync(outFile, out, { flag: 'a' });
        }

        seen[instId] = true;
      }
    } 
  } catch (e) {
    console.log(e.message);
  }
})();
