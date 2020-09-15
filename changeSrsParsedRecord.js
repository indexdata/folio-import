/*
  This script will take a collection in JSONL format of source records and edit the parsedRecord object 
  via an external script.
*/

const fs = require('fs');
const readline = require('readline');
let inFile = process.argv[3];
let scriptFile = process.argv[2];

(async () => {
  try {
    let inData;
    if (!inFile) {
      throw new Error('Usage: node changeSrsParsedRecord.js <script file> <source_record_collection.jsonl>');
    } else if (!fs.existsSync(inFile)) {
      throw new Error('Can\'t find input file');
    }

    let outFile = inFile.replace(/^(.+)\..*/, '$1_updated.jsonl');
    const editor = require(scriptFile);
    const fileStream = fs.createReadStream(inFile);
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });

    if (fs.existsSync(outFile)) {
      fs.unlinkSync(outFile);
    }
    
    let x = 0;
    for await (const line of rl) {
      x++;
      let rec = JSON.parse(line);
      console.log(`# ${x} ${rec.id}`);
      let prUpdated;

      if (rec.parsedRecord) {
        prUpdated = editor(rec.parsedRecord.content);
      }

      if (prUpdated) {
        // sort the fields
        prUpdated.fields.sort((a, b) => {
          aTag = Object.keys(a)[0];
          bTag = Object.keys(b)[0];
          if (aTag < bTag) return -1;
          else if (bTag > bTag) return 1;
          else return 0;
        });

        rec.parsedRecord = prUpdated;
        console.log(`Writing to ${outFile}`);
        let out = JSON.stringify(rec) + '\n';
        fs.writeFileSync(outFile, out, { flag: 'a' });
      }
      
    } 
  } catch (e) {
    console.log(e.message);
  }
})();
