const fs = require('fs');
const path = require('path');
const parse = require('csv-parse/lib/sync');
const uuid = require('uuid/v5');
const superagent = require('superagent');

const spFile = process.argv[2];
const usersFile = process.argv[3];
const csvFile = process.argv[4];
const ns = '34d6cfa4-f604-47ec-83d2-3c2aec16a986';
const tenant = 'sul';

(async () => {
  try {
    if (!csvFile) {
      throw new Error('Usage: node sulRequests.js <service_points_file> <users_file> <loans_csv_file>');
    }
    if (!fs.existsSync(csvFile)) {
      throw new Error('Can\'t find loans file');
    }
    if (!fs.existsSync(spFile)) {
      throw new Error('Can\'t find service points file');
    }
    if (!fs.existsSync(usersFile)) {
      throw new Error('Can\'t find users file');
    }

    let begin = new Date().valueOf();

    const config = JSON.parse(fs.readFileSync('../.okapi', { encoding: 'utf8' }));
    if (config.tenant !== tenant) throw new Error('There is a tenant mismatch. Run the authToken.js script with proper config!');

    const sp = require(spFile);
    spMap = {};
    console.log(`Mapping service points from ${spFile}`);
    sp.servicepoints.forEach(s => {
      spMap[s.code] = s.id;
    });

    let csv = fs.readFileSync(csvFile, { encoding: 'utf8'});
    csv = csv.replace(/^\uFEFF/, ''); // remove BOM

    const inRecs = parse(csv, {
      columns: true,
      skip_empty_lines: true
    });

    console.log(`Loading users from ${usersFile}`);
    const users = require(usersFile);
    delete require.cache[require.resolve(usersFile)];

    let requesters = {};
    users.users.forEach(u => {
      requesters[u.barcode] = { active: u.active, expirationDate: u.expirationDate, id: u.id };
    });

    let dateOffset = (dt) => {
      let dzo = new Date(dt).getTimezoneOffset();
      let pto = ((dzo+120)/60);  // change this value according to the local machine that runs the script.
      out = `-0${pto}:00`;
      return out; 
    }

    const files = {
      co: 'requests.jsonl',
      ia: 'inactive_requests.jsonl',
      nf: 'no_user_requests.jsonl'
    };

    let workDir = path.dirname(csvFile);
    for (let f in files) {
      let fullPath = workDir + '/' + files[f];
      if (fs.existsSync(fullPath)) fs.unlink(fullPath);
      files[f] = fullPath;
    }

    const write = (obj, file) => {
      console.log(`Writing ${obj.checkouts.length} to ${file}`);
      fs.writeFileSync(file, JSON.stringify(obj, null, 2));
    };

    let total = 0;
    const ibcodeSeen = {};

    for (let x = 0; x < inRecs.length; x++) {
      let r = inRecs[x];
      total++;
      let ubcode = r['User barcode'];
      let ibcode = r['Item barcode'];
      let rdate = r['Request date'];
      let exdate = r['Request expiration date'];
      let sp = r['Pickup servicepoint'];
      let rflag = r['Recallled flag'];
      let adata = r['Date available'];
      let ukey = ubcode + ibcode;
      let userId = requesters[ubcode].id;
      let spId = spMap[sp];
      let item;

      if (!ibcodeSeen[ibcode]) {
        let url = `${config.url}/item-storage/items?query=barcode==${ibcode}`;
        console.log(`[${total}] GET ${url}`);
        try {
          let res = await superagent
            .get(url)
            .set('x-okapi-token', config.token);
          item = res.body.items[0];
          if (item) {
            try {
              let res = await superagent
                .get(`${config.url}/holdings-storage/holdings/${item.holdingsRecordId}`)
                .set('x-okapi-token', config.token);
              item.instanceId = res.body.instanceId;
            } catch (e) {
              let msg = (e.response) ? e.response.text : e;
              console.log(msg); 
            }
          }
        } catch (e) {
          let msg = (e.response) ? e.response.text : e;
          console.log(msg);
        }
      } else {
        console.log(`[${total}] Item with barcode ${ibcode} found in cache...`);
        item = ibcodeSeen[ibcode];
      }
      
      if (item) {
        rdate = rdate.replace(/^(\d{4})(\d\d)(\d\d)/, '$1-$2-$3T12:00:00');
        rdate += dateOffset(rdate);
        let requestType = "Page";
        if (item.status.name === "Checked out") {
          requestType = "Hold"
        }
        let req = {
          id: uuid(ukey, ns),
          requesterId: userId,
          itemId: item.id,
          holdingsRecordId: item.holdingsRecordId,
          instanceId: item.instanceId,
          requestDate: rdate,
          fulfilmentPreference: "Hold Shelf",
          pickupServicePointId: spId,
          requestType: requestType,
          requestLevel: 'Item'
        };
        ibcodeSeen[ibcode] = item;
        reqStr = JSON.stringify(req);
        console.log(reqStr);
      }
    }

    let end = new Date().valueOf();
    let tt = (end - begin)/1000;
    console.log('Time (secs)', tt);
    console.log('Processed', total);
  } catch (e) {
    const msg = (e.message) ? e.message : e;
    console.error(e.message);
  }
})();
