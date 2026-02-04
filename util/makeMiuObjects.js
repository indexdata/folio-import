const fs = require('fs');
const path = require('path');
let xslFile = process.argv[2];
let desc = 'Charles test';
if (!xslFile) {
    throw('Usage: node makeStep <xsl_file>');
}
let base = path.basename(xslFile, '.xsl');
let dir = path.dirname(xslFile);
let outFile = dir + '/' + base + '-step.jsonl';
let trFile = dir + '/' + base + '-transformation.jsonl';
let chFile = dir + '/' + base + '-channel.jsonl';
let xsl = fs.readFileSync(xslFile, {encoding: 'utf8'});
let step = {
    id: 'dcc2d6e1-d28b-4177-adcc-ab5b460a5d00',
    name: base,
    description: desc,
    type: 'XmlTransformStep',
    script: xsl
};
console.log(`Saving step to ${outFile}`);
fs.writeFileSync(outFile, JSON.stringify(step));

let tr = {
    id: 'efaa8119-1e4d-4cd1-bf18-b9722a74478f',
    name: base,
    description: desc,
    steps: [ { id: step.id, name: step.name }]
};
console.log(`Saving transformation to ${trFile}`)
fs.writeFileSync(trFile, JSON.stringify(tr));

let ch = {
    id: '757fe807-a906-414d-a251-486fbabe5586',
    name: base,
    tag: base,
    type: 'XML',
    transformationId: tr.id,
    enabled: true,
    listening: true
};
console.log(`Saving channel to ${chFile}`);
fs.writeFileSync(chFile, JSON.stringify(ch));