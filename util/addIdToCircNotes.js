const uuid = require('uuid/v4');
const fs = require('fs');
const readline = require('readline');

let inFile = process.argv[2];

(async () => {
  const fileStream = fs.createReadStream(inFile);

  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  for await (const line of rl) {
    let rec = JSON.parse(line);
    rec.circulationNotes.forEach(c => {
      c.id = uuid();
      c.date = new Date(c.date);
    })
    console.log(JSON.stringify(rec));
  }
})();