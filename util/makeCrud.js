const uuid = require('uuid/v5');
const fs = require('fs');
const argv = require('minimist')(process.argv.slice(2));

const ns = 'e3398111-2ca9-4c06-b849-7301325e0786';

const tsvFile = argv._.shift();
const ncol = argv.n;
const ccol = argv.c;
const source = argv.s;

try {
  if (!tsvFile) {
    throw 'Usage: node makeCrud.js [ -n name_col, -c code_col , -s source_value ] <tsv_file> [ field=value, vield=value, ...]';
  }
  let fields = {};
  argv._.forEach(a => {
    let kv = a.split(/=/);
    fields[kv[0]] = kv[1];
  });
  const tsv = fs.readFileSync(tsvFile, 'utf8');
  let lines = tsv.split(/\r?\n/);
  const nseen = {};
  const cseen = {};
  lines.forEach(l => {
    if (l.match(/\t/)) {
      let col = l.split(/\t/);
      let out = {};
      if (ncol) {
        let c = ncol - 1;
        out.name = col[c].trim();
      }
      if (ccol) {
        let c = ccol - 1;
        out.code = col[c].trim();
      }
      if (source) {
        out.source = source;
      }
      if (nseen[out.name] && out.code) {
        out.name += ` (${out.code})`;
      }
      if (cseen[out.code] && out.name) {
        out.code += ` (${out.name})`;
      }
      if (out.name) nseen[out.name] = 1;
      if (out.code) cseen[out.code] = 1;
      if (out.code) {
        out.id = uuid(out.code, ns);
      } else {
        out.id = uuid(out.name, ns);
      }
      for (let field in fields) {
        let val = fields[field];
        if (val.match(/^\[/)) {
          val = val.replace(/^\[(.+)\]/, '$1');
          out[field] = [ val ];
        } else {
          out[field] = fields[field];
        }
      }
      console.log(JSON.stringify(out));
    }
  });
} catch (e) {
  console.error(e);
}