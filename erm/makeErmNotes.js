/*
  Since the agreements module is crap and we can't assign predetermined ids to anything, it is impossible to create note objects
  and link them to an agreement-- this must be done after the aggreements are loaded.

  Required: A file of notes objects in jsonl format with the aggreement name in the links.id property.  You'll also need a jsonl
  file of the aggrements that were added to FOLIO-- use the downloadAllByEndpoint.js erm/sas command to get all agreements (the 
  postJSONL.js script will create a file called agreementsOut.jsonl, which is also fine).
*/

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const agFile = process.argv[2];
const inFile = process.argv[3];

(async () => {
  try {
    if (!inFile) throw('Usage: node makeErmNotes.js <agreements_jsonl_file> <notes_jsonl_file>');
    if (!fs.existsSync(inFile)) throw new Error(`Can't find ${inFile}!`);
    
    const dir = path.dirname(inFile);
    const base = path.basename(inFile, '.jsonl');
    const outFile = `${dir}/${base}-load.jsonl`;
    if (fs.existsSync(outFile)) fs.unlinkSync(outFile);

    let fileStream = fs.createReadStream(agFile);
    let rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });

    const idMap = {};
    for await (const line of rl) {
      let j = JSON.parse(line);
      idMap[j.name] = j.id;
    }
    // console.log(idMap); return;

    fileStream = fs.createReadStream(inFile);
    rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });

    let c = 0;
    let e = 0;
    for await (const line of rl) {
      let j = JSON.parse(line);
      let k = j.links[0].id.trim();
      let aid = idMap[k];
      if (aid) {
        j.links[0].id = aid;
        let out = JSON.stringify(j);
        fs.writeFileSync(outFile, out + '\n', { flag: 'a' });
        c++;
      } else {
        console.log(`ERROR No agreement match for "${k}"`);
        e++;
      }
    }
    console.log('Notes created:', c);
    console.log('Saved to:', outFile);
    console.log('Errors:', e);
  } catch (e) {
    console.error(e);
  }
})();