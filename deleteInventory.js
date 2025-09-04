const fs = require('fs');
const argv = require('minimist')(process.argv.slice(2));
const superagent = require('superagent');
const readline = require('readline');
const { getAuthToken } = require('./lib/login');
let ten = argv._[0];
let saveDir = argv.s;
let instId = argv.i || '*';
let inFile = argv.f;
let dbug = process.env.DEBUG;
let tval = new Date().valueOf();

const sfiles = {
  inst: 'instances.jsonl',
  hold: 'holdings.jsonl',
  item: 'items.jsonl',
  srs: 'srs.jsonl'
};

const out = {};

const sep = '----------------------------------------------------------------------------------------------';

(async () => {
  try {
    if (!ten) {
      throw new Error('Usage: node deleteInventory.js <tenant> [ options: -s <save_dir>, -i <instance_id>, -f <instance_file> ]');
    }

    let config = await getAuthToken(superagent);
    if (ten !== config.tenant) {
      throw new Error(`Tenent "${ten}" does not match "${config.tenant}"`);
    }

    if (saveDir) {
      saveDir = saveDir.replace(/\/$/, '');
      for (let f in sfiles) {
        sfiles[f] = saveDir + '/' + sfiles[f];
        if (fs.existsSync(sfiles[f])) fs.unlinkSync(sfiles[f]);
        out[f] = fs.createWriteStream(sfiles[f]);
      }
    }
    // console.log(sfiles); return;

    const delBound = async (url) => {
      let id = url.replace(/.+\//, '');
      let idType = (url.match(/items/)) ? 'itemId' : 'holdingsRecordId';
      let q = `${idType}==${id}`;
      let base = `${config.okapi}/inventory-storage/bound-with-parts`;
      let gurl = `${base}?query=${q}`; 
      let res = await get(gurl);
      for (let x = 0; x < res.boundWithParts.length; x++) {
        let r = res.boundWithParts[x];
        let durl = `${base}/${r.id}`;
        await del(durl);
      }
      let c = await del(url, true);
      return c;
    }

    const delRel = async (url) => {
      let id = url.replace(/.+\//, '');
      let q = `superInstanceId==${id} OR subInstanceId==${id}`;
      let base = `${config.okapi}/instance-storage/instance-relationships`;
      let gurl = `${base}?query=${q}`; 
      let res = await get(gurl);
      let c = 0;
      for (let x = 0; x < res.instanceRelationships.length; x++) {
        let r = res.instanceRelationships[x];
        let durl = `${base}/${r.id}`;
        await del(durl);
        c++;
      }
      return c;
    }

    const get = async (url) => {
      try {
        console.log(`GET ${url}`);
        let res = await superagent
          .get(url)
          .set('accept', 'application/json')
          .set('x-okapi-token', config.token);
        return res.body;
      } catch (e) {
        throw new Error(e);
      }
    }

    const del = async (url, noRetry) => {
      try {
        console.log(`DELETE ${url}`);
        let res = await superagent
          .delete(url)
          .set('x-okapi-token', config.token)
        return res;
      } catch (e) {
        let msg = (e.response && e.response.text) ? e.response.text : e;
        if (!noRetry && msg && msg.match(/bound_with/)) {
          let c = await delBound(url);
          return c;
        } else if (!noRetry && msg && msg.match(/instance_relationship/)) {
          let c = await delRel(url);
          return c;
        } else {
          console.log(msg);
          return -1;
        }
      }
    }

    const delItems = async (items) => {
      let c = 0;
      for (let x = 0; x < items.length; x++) {
        let item = items[x];
        let res = await del(`${config.okapi}/item-storage/items/${item.id}`);
        if (res === -1) {
          return -1;
        } else {
          c++;
        }
      }
      return c;
    }
    
    const delHoldings = async (holdings) => {
      let c = 0;
      for (let x = 0; x < holdings.length; x++) {
        let rec = holdings[x];
        let res = await del(`${config.okapi}/holdings-storage/holdings/${rec.id}`);
        if (res === -1) {
          return -1;
        } else {
          c++;
        }
      }
      return c;
    }

    const runSearch = async (instId, ttl, totRecs, perPage) => {
      console.log(sep);
      while (totRecs > 0) {
        let url = `${config.okapi}/search/instances?expandAll=true&query=id==${instId} sortby title&limit=${perPage}`;
        let res = await get(url);
        let recs = res.instances;
        totRecs = res.totalRecords;
        if (totRecs === 0) {
          console.log(`No instances found`);
          console.log(sep);
          continue;
        } else {
          console.log(`Instances found: ${totRecs}`);
          if (totRecs === 1) totRecs = 0;
        }
        for (let x = 0; x < recs.length; x++) {
          let rec = recs[x];
          let ic = await delItems(rec.items);
          let hc = -1;
          if (ic > -1) { 
            ttl.items += ic;
            hc = await delHoldings(rec.holdings);
          }
          if (hc > -1) {
            ttl.holdings += hc;
            let bc = await del(`${config.okapi}/instance-storage/instances/${rec.id}`);
            if (bc !== -1) {
              ttl.instances++;
              let sc = await del(`${config.okapi}/source-storage/records/${rec.id}?idType=INSTANCE`);
              if (sc !== -1) ttl.srs++;
            }
          }
          console.log(sep);
        }
      }
      return;
    }

    let ttl = {
      instances: 0,
      holdings: 0,
      items: 0,
      srs: 0
    };

    if (inFile) {
      const fileStream = fs.createReadStream(inFile);

      const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
      });

      for await (const line of rl) {
        let r = JSON.parse(line);
        await runSearch(r.id, ttl, 100000, 10);
      }
    } else {
      await runSearch(instId, ttl, 100000, 10);
    }
    console.log(ttl);

  } catch (e) {
    if (dbug) {
        console.log(e);
    } else {
    	console.error(e.message);
    }
  }
})();
