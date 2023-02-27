/*
  This script takes a log produced by running postJSONL.js, putJSONL.js or loadJSONL.js and will cherry pick
	error records from the data file and save them into a separate file.  There is a required regexp match string that will
	limit by certain types of errors.
*/


const dataFile = process.argv[2];
const logFile = process.argv[3];
const matchStr = process.argv[4];
const fs = require('fs');
const readline = require('readline');
const path = require('path');

(async () => {
	try {
		if (!matchStr) {
			throw 'Usage: node parseErrors.js <data_file_jsonl> <log_file_jsonl> <match_string>';
		}
		let outFile = matchStr.replace(/\W+/g, '_');
		outFile = outFile.toLowerCase();
		let dir = path.dirname(dataFile);
		let outPath = dir + '/' + outFile + '.jsonl';
		if (fs.existsSync(outPath)) {
			fs.unlinkSync(outPath);
		}
		

		let fileStream = fs.createReadStream(dataFile);

		let rl = readline.createInterface({
			input: fileStream,
			crlfDelay: Infinity
		});

		console.log(`Mapping data file...`);
		const dataMap = {};
		let dc = 0;
		for await (const line of rl) {
			let rec = JSON.parse(line);
			let key = rec.id;
			dataMap[key] = line;
			dc++;
		}
		console.log(`${dc} data lines mapped.`);

		fileStream = fs.createReadStream(logFile);

		rl = readline.createInterface({
			input: fileStream,
			crlfDelay: Infinity
		});

		console.log(`Reading log file...`);
		let lc = 0;
		let postLine = '';
		for await (const line of rl) {
			if (line.match(/errors/) && line.match(matchStr)) {
				let post = JSON.parse(postLine);
				let id = '';
				if (post && post.message) {
					id = post.message.replace(/.*?(\w{8}-\w{4}-\w{4}-\w{4}-\w{12}).*/, '$1');
				}
				if (id) {
					let rec = dataMap[id];
					fs.writeFileSync(outPath, rec + '\n', { flag: 'a' });
					lc++;
				}
			}
			postLine = line;
		}
		console.log(`${lc} error lines found matching ${matchStr}.`);


	} catch (e) {
		console.log(e);
	}
})();
