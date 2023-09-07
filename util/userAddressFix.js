const fs = require('fs');
const path = require('path');
const readline = require('readline');

const inFile = process.argv[2];

(async () => {
  try {
    if (!inFile) throw('Usage: node userAddressFix.js <users_jsonl_file> ');
    if (!fs.existsSync(inFile)) throw new Error(`Can't find ${inFile}!`);
    
    const dir = path.dirname(inFile);
    const outFile = `${dir}/users_address_fixed.jsonl`;
    const saveFile = `${dir}/users-saved.jsonl`;
    if (fs.existsSync(outFile)) fs.unlinkSync(outFile);
    if (fs.existsSync(saveFile)) fs.unlinkSync(saveFile);

    let fileStream = fs.createReadStream(inFile);
    let rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });

    let c = 0
    let cities = {};
    for await (const line of rl) {
      let change = false;
      let rec = JSON.parse(line);
      let addr = rec.personal.addresses;
      addr.forEach(a => {
        if (!a.city && a.addressLine2 && a.addressLine2.match(/, [A-Z]{2}\b/)) {
          a.city = a.addressLine2;
          a.addressLine2 = '';
        }
        if (a.city && a.city.match(/,/)) {
          // if (!cities[a.city]) cities[a.city] = 0
          // cities[a.city]++;
          // console.log(a);
          
          let cs = a.city.split(/, */);
          a.city = cs[0].trim();
          if (cs[1]) a.region = cs[1].trim();
          if (a.region.match(/\d{5}/)) {
            let sz = a.region.split(/ +/);
            console.log('Zipcode found is region', sz);
            a.region = sz[0];
            a.postalCode = sz[1];
          }
          change = true;
          c++;
        }
        
      });
      if (change) {
        let recStr = JSON.stringify(rec);
        fs.writeFileSync(outFile, recStr + '\n', {flag: 'a'});
        fs.writeFileSync(saveFile, line + '\n', {flag: 'a'});
        if (c % 10000 === 0) {
          console.log('Records changed', c);
        }
      }
      if (process.env.DEBUG && c === 10) break
      
    }
    // console.log(cities);
    console.log('Total records changed', c);
  } catch (e) {
    console.error(e);
  }
})();