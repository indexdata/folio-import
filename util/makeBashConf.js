let fn = process.argv[2];

try {
	if (!fn) throw("Usage: node makeBashConf.js <js_config_file>");
	fn = fn.replace(/^([^\.\/])/, './$1');
	const conf = require(fn);
	let out = `#!/bin/bash

OKAPI='${conf.okapi}'
TENANT='${conf.tenant}'
AUTHPATH='/bl-users/login'
TMPDIR='.okapi'
USER='${conf.username}'
PASS='${conf.password}'

if [ ! -d $TMPDIR ]
  then
    mkdir $TMPDIR
fi

echo $TENANT > \${TMPDIR}/tenant
echo $OKAPI > \${TMPDIR}/url
curl -w '\\n' \${OKAPI}\${AUTHPATH} \\
  -H 'content-type: application/json' \\
  -H "x-okapi-tenant: \${TENANT}" \\
  -d "{\\"username\\":\\"\${USER}\\",\\"password\\":\\"\${PASS}\\"}" \\
  -D \${TMPDIR}/headers

grep 'x-okapi-token' \${TMPDIR}/headers | cut -f 2 -d ' ' > \${TMPDIR}/token`
console.log(out);
} catch (e) {
	console.log(e);
}
