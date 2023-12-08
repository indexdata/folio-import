const prompts = require('prompts');
const fs = require('fs');

const confDir = '../configs/js';


(async () => {
  while (1) {

    let files = fs.readdirSync(confDir);
    let fileList = [];
    files.forEach(f => {
      let t = f.replace(/\.js$/, '');
      fileList.push({title: t, value: confDir + '/' + f});
    })

    const cres = await prompts([
      {
        type: 'autocomplete',
        message: 'Pick a config',
        name: 'file',
        choices: fileList,
        limit: 20,
        initial: 0
      }
    ]);   
    let conf = require(cres.file);
    console.log(conf);
    const cont = await prompts([
      { 
        type: 'text',
        message: 'Enter a command',
        name: 'value'
      }
    ]);
    if (cont.value === 'exit') break;
  }
})();
