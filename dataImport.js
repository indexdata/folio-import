const fs = require('fs');
const superagent = require('superagent');
const uuidv1 = require('uuid/v1');
const { getAuthToken } = require('./lib/login');

const wait = (ms) => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

const uploadDefs = async (authToken, config, mFiles) => {
  const fileDefs = { fileDefinitions: [] };
  const actionUrl = config.okapi + '/data-import/uploadDefinitions';
  for (m = 0; m < mFiles.length; m++) {
    if (mFiles[m].match(/\.(mrc|marc)$/)) {
      let fileDef = { name: mFiles[m] };
      fileDefs.fileDefinitions.push(fileDef);
    }
  }
  if (fileDefs.fileDefinitions.length == 0) {
    throw new Error('No .mrc or .marc files found!');
  }
  try {
    const res = await superagent
      .post(actionUrl)
      .set('accept', 'application/json')
      .set('content-type', 'application/json')
      .set('x-okapi-token', authToken)
      .send(fileDefs);
    return res.body;
  } catch (e) {
    console.error(e.message);
  }
};

const uploadFiles = async (authToken, config, uploadDef, batDir) => {
  const actionUrl = `${config.okapi}/data-import/uploadDefinitions/${uploadDef.id}/files`;
  const fd = uploadDef.fileDefinitions;
  var response;
  for (x = 0; x < fd.length; x++) {
    let url = `${actionUrl}/${fd[x].id}`;
    let mrcPath = `${batDir}/${fd[x].name}`;
    let mrcData = fs.readFileSync(mrcPath, 'utf8');
    console.log(`Uploading ${mrcPath}...`);
    try {
      const res = await superagent
        .post(url)
        .set('content-type', 'application/octet-stream')
        .set('accept', 'application/json')
        .set('x-okapi-token', authToken)
        .send(mrcData);
      response = res.body;
    } catch (e) {
      console.error(e);
    }
  }
  return response;
};

const procFiles = async (authToken, config, procFileReq) => {
  const actionUrl = `${config.okapi}/data-import/uploadDefinitions/${procFileReq.id}/processFiles`;
  try {
    const res = await superagent
      .post(actionUrl)
      .set('accept', 'application/json')
      .set('content-type', 'application/json')
      .set('x-okapi-token', authToken)
      .send(procFileReq);
    return res.headers;
  } catch (e) {
    console.error(e);
  }
};

(async () => {
  let batDir = process.argv[2];
  let mFiles = [];
  try {
    if (!batDir) {
      throw new Error('Usage: node dataImport.js <batch_directory>');
    } else if (!fs.existsSync(batDir)) {
      throw new Error('Can\'t find batch directory');
    } else {
      mFiles = fs.readdirSync(batDir);
    }
    batDir = batDir.replace(/\/$/, '');
    const config = (fs.existsSync('./config.js')) ? require('./config.js') : require('./config.default.js');
    const authToken = await getAuthToken(superagent, config.okapi, config.tenant, config.authpath, config.username, config.password);


    const uploadDef = await uploadDefs(authToken, config, mFiles);
    const loaded = await uploadFiles(authToken, config, uploadDef, batDir);
    const fileDefs = loaded.fileDefinitions;
    for (let x = 0; x < fileDefs.length; x++) {
      let fileName = fileDefs[x].name.replace(/\.mrc$/, '_snap.json');
      let defString = JSON.stringify(fileDefs[x], null, 2);
      fs.writeFileSync(`${batDir}/${fileName}`, defString);
    }
    procFilesReq = {};
    procFilesReq.uploadDefinition = loaded;
    procFilesReq.jobProfileInfo = {
      id: uuidv1(),
      name: 'Default job profile',
      dataType: 'MARC'
    };
    const out = await procFiles(authToken, config, procFilesReq);
    console.log(JSON.stringify(procFilesReq, null, 2));
  } catch(e) {
    console.error(e.message);
  }
})();
