const fs = require('fs');
const argv = require('minimist')(process.argv.slice(2));
const superagent = require('superagent');
const { getAuthToken } = require('./lib/login');
let ten = argv._[0];
let saveDir = argv.s;
let instId = argv.i || '*';
const endPoint = 'search/instances?expandAll=true&query=id==*&limit=10';
let dbug = process.env.DEBUG;
let tval = new Date().valueOf();

const sfiles = {
  inst: 'instances.jsonl',
  hold: 'holdings.jsonl',
  item: 'items.jsonl',
  srs: 'srs.jsonl'
};

const out = {};

(async () => {
  try {
    if (!ten) {
      throw new Error('Usage: node deleteInventory.js <tenant> [ <save_dir> ]');
    }

    let config = await getAuthToken(superagent);
    if (ten !== config.tenant) {
      throw new Error(`Tenent "${ten}" does not match "${config.tenant}"`);
    }

    let actionUrl = config.okapi + '/' + endPoint;

    if (saveDir) {
      saveDir = saveDir.replace(/\/$/, '');
      for (let f in sfiles) {
        sfiles[f] = saveDir + '/' + sfiles[f];
        if (fs.existsSync(sfiles[f])) fs.unlinkSync(sfiles[f]);
        out[f] = fs.createWriteStream(sfiles[f]);
      }
    }
    // console.log(sfiles); return;

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

    const del = async (url) => {
      try {
        console.log(`DELETE ${url}`);
        let res = await superagent
          .delete(url)
          .set('x-okapi-token', config.token)
        return res;
      } catch (e) {
        console.log(e);
        return -1;
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

    let ttl = {
      instances: 0,
      holdings: 0,
      items: 0,
      srs: 0
    };
    let totRecs = 1000000;
    let perPage = 10; 
    while (totRecs > 0) {
      let url = `${config.okapi}/search/instances?expandAll=true&query=id==${instId} sortby title&limit=${perPage}`;
      let res = await get(url);
      let recs = res.instances;
      totRecs = res.totalRecords;
      if (totRecs === 0) {
        console.log(`No instances found`);
        continue;
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
          await del(`${config.okapi}/instance-storage/instances/${rec.id}`);
          ttl.instances++;
          await del(`${config.okapi}/source-storage/records/${rec.id}?idType=INSTANCE`);
          ttl.srs++;
        }
      }
      totRecs = 0;
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
