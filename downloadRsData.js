
const fs = require('fs');
const superagent = require('superagent');
const { getAuthToken } = require('./lib/login');
let refDir = process.argv[2];
let modName = process.argv[3];
let dbug = process.env.DEBUG;

(async () => {
  try {
    if (!refDir) {
      throw new Error('Usage: node downloadRsData.js <save_dir> [ <mod_name_regexp> ]');
    } else if (!fs.existsSync(refDir)) {
      throw new Error('Save directory does\'t exist!');
    } else if (!fs.lstatSync(refDir).isDirectory()) {
      throw new Error(`${refDir} is not a directory!`)
    }
    refDir = refDir.replace(/\/$/, '');

    let startTime = new Date().valueOf();

    let config = await getAuthToken(superagent);
    let authToken = config.token;

    let mdUrls = [
      'https://raw.githubusercontent.com/openlibraryenvironment/mod-rs/refs/heads/master/service/src/main/okapi/ModuleDescriptor-template.json',
      'https://raw.githubusercontent.com/openlibraryenvironment/mod-directory/refs/heads/main/service/src/main/okapi/ModuleDescriptor-template.json'
    ];

    let added = [
      { mod: 'mod-directory', path: 'directory/tags' },
      { mod: 'mod-directory', path: 'directory/service' },
      { mod: 'mod-directory', path: 'directory/refdata' },
      { mod: 'configurations', path: 'configurations/entries' }
    ]

    if (modName) {
      let tmp = [];
      for (let x = 0; x < mdUrls.length; x++) {
        if (mdUrls[x].match(modName)) {
          tmp.push(mdUrls[x]);
        }
      }
      if (tmp.length > 0) {
        mdUrls = tmp;
      } else {
        throw new Error(`No match found for module "${modName}!`);
      }
    }

    const skipList = {};

    const priority = [];

    try {
      console.log('Getting modules list...');
      let res = await superagent
        .get(`${config.okapi}/_/proxy/tenants/${config.tenant}/modules`)
        .set('User-Agent', config.agent)
        .set('cookie', config.cookie)
        .set('x-okapi-tenant', config.tenant)
        .set('x-okapi-token', config.token)
        for (let x = 0; x < res.body.length; x++) {
          let m = res.body[x];
        };
    } catch (e) {
      console.log(e);
    }
    
    let paths = [];

    for (let z = 0; z < mdUrls.length; z++) {
      let ordStr = z.toString().padStart(2, '0')
      let url = mdUrls[z];
      if (dbug) console.log(`GET ${url}`);
      try {
        let res = await superagent.get(url)
         .set('User-Agent', config.agent);
        let md = JSON.parse(res.text);
        let name = md.name.replace(/ +/g, '_');
        if (name.match(/info\.app\.name/)) name = 'mod-rs';
        let prov = md.provides;
        for (let x = 0; x < prov.length; x++) {
          let hand = prov[x].handlers;
          for (let y = 0; y < hand.length; y++) {
            let method = hand[y].methods[0];
            let pp = hand[y].pathPattern;
            pp = pp.replace(/{recordType}/, '');
            if (method === 'GET' && !pp.match(/\{|^\/_/)) {
              if (skipList[pp]) {
                console.log(`Skipping ${pp}`);
              } else {
                pp = pp.replace(/^\//, '');
                pp = pp.replace(/\*/g, '');
                paths.push({ mod: name, path: pp });
              }
            }
          }
        }
      } catch (e) {
        console.error(e.message);
      }
    }

    // paths = [...paths, ...added];
    // console.log(paths); return;

    for (let x = 0; x < paths.length; x++) {
      let saveDir = paths[x].mod.toLowerCase();
      paths[x].path = paths[x].path.replace(/\*/g, '');
      let fileName = paths[x].path.replace(/\//g, '__');
      fileName = fileName.replace(/&/g, '%26');
      fileName = fileName.replace(/\?/g, '%3F');
      fileName = fileName.replace(/=/g, '%3D');
      console.log(`Fetching ${paths[x].path}...`);
      let url = `${config.okapi}/${paths[x].path}`;
      if (!url.match(/\?/)) {
        url += '?stats=true&perPage=500';
      } 
      
      try {
        let res = {};
        if (dbug) console.log(`GET ${url}`);
        res = await superagent
          .get(url)
          .timeout({response: 9000})
          .set('User-Agent', config.agent)
          .set('cookie', config.cookie)
          .set('x-okapi-tenant', config.tenant)
          .set('x-okapi-token', config.token);
        let save = true;
        if (res.body.totalRecords !== undefined && res.body.totalRecords === 0) { 
          save = false;
          console.log('  No records found')
        }
        if (save) {
          let jsonStr = JSON.stringify(res.body, null, 2);
          let fullSaveDir = refDir + '/' + saveDir;
          if (!fs.existsSync(fullSaveDir)) {
            console.log(`\x1b[32m(Creating directory: ${saveDir})\x1b[0m`);
            fs.mkdirSync(fullSaveDir);
          }
          let p = priority.indexOf(fileName);
          if (p > -1) {
            let pstr = p.toString().padStart(2, '0');
            fileName = `${pstr}-${fileName}`;
          }
          fs.writeFileSync(`${fullSaveDir}/${fileName}.json`, jsonStr);
        }
      } catch (e) {
        try {
          console.log(`\x1b[31m${e}\x1b[0m`);
        } catch {
          console.log(e.message);
        }
      }
    }
    let endTime = new Date().valueOf();
    let ttl = (endTime - startTime) / 1000;
    console.log(`\x1b[33mDone in ${ttl} secs\x1b[0m`);
  } catch (e) {
    console.error(e.message);
  }
})();
