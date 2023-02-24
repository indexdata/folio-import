const MongoClient = require('mongodb').MongoClient;
const fs = require('fs');
const recs = require(process.argv[2]);

const path = process.argv[2].replace(/(.+)\.json/, '$1_comp.json');
// Connection URL
const url = 'mongodb://localhost:27017';

// Database Name
const dbName = 'uc';

(async () => {
    const client = await new MongoClient(url, { useUnifiedTopology: true });
    await client.connect();
    const db = await client.db(dbName);
    const oi = await db.collection('orderitems');
    for (let x = 0; x < recs.length; x++) {
	let poId = recs[x].id;
	console.log(`[${x}] ${poId}`);
	recs[x].compositePoLines = [];
    	let cursor = await oi.find({ purchaseOrderId: poId });
	while (await cursor.hasNext()) {
          let poLine = await cursor.next();
	  delete poLine._id;
	  recs[x].compositePoLines.push(poLine);
        }
    }
    await client.close();
    fs.writeFileSync(path, JSON.stringify(recs, null, 2));
})();
