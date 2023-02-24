const MongoClient = require('mongodb').MongoClient;
const fs = require('fs');
const recs = require(process.argv[2]);

const path = process.argv[2].replace(/(.+)\.json/, '$1_srs.json');
// Connection URL
const url = 'mongodb://localhost:27017';

// Database Name
const dbName = 'uc';

(async () => {
    const client = await new MongoClient(url, { useUnifiedTopology: true });
    await client.connect();
    const db = await client.db(dbName);
    const rcoll = await db.collection('raw');
    const pcoll = await db.collection('parsed');
    for (let x = 0; x < recs.length; x++) {
	let rawId = recs[x].rawRecordId;
	let parId = recs[x].parsedRecordId;
    	recs[x].rawRecord = await rcoll.findOne({ id: rawId }, { projection: { _id: 0 } });
    	recs[x].parsedRecord = await pcoll.findOne({ id: parId }, { projection: { _id: 0 } });
	delete recs[x].rawRecordId;
	delete recs[x].parsedRecordId;
    }
    await client.close();
    fs.writeFileSync(path, JSON.stringify(recs, null, 2));
})();
