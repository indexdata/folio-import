const uuid = require('uuid/v5');
const fs = require('fs');
const argv = require('minimist')(process.argv.slice(2));

const ns = 'e3398111-2ca9-4c06-b849-7301325e0786';

const tsvFile = argv._.shift();
const ncol = argv.n;
const ccol = argv.c;
const desc = argv.d;
const source = argv.s;
const normalize = argv.z;
const group = argv.g;

try {
  if (!tsvFile) {
    throw 'Usage: node makeCrud.js [ -n name_col, -c code_col, -s source_value, -g group, -d desc, -z normlize_code_or_group ] <tsv_file> [ field=value, vield=value, ...]';
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
    if (l.match(/\t|\w/)) {
      let col = l.split(/\t/);
      let out = {};
      if (ncol) {
        let c = ncol - 1;
        out.name = col[c].trim();
      }
      if (ccol) {
        let c = ccol - 1;
        if (normalize) {
          col[c] = col[c].replace(/'/g, '');
          col[c] = col[c].replace(/\W+/g, '_');
          col[c] = col[c].toLowerCase();
        }
        out.code = col[c].trim();
      }
      if (source) {
        out.source = source;
      }
      if (group) {
        c = group - 1;
        out.group = col[c].trim();
      }
      if (desc) {
        c = desc - 1;
        if (normalize) {
          col[c] = col[c].replace(/'/g, '');
          col[c] = col[c].replace(/\W+/g, '_');
          col[c] = col[c].toLowerCase();
        }
        out.desc = col[c].trim();
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
      } else if (out.group) {
        out.id = uuid(out.group, ns);
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