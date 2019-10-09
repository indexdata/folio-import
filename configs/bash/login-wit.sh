#!/bin/bash

OKAPI='https://okapi-flo.folio-dev.indexdata.com'
TENANT='wit_daisy'
AUTHPATH='/bl-users/login'
TMPDIR='.okapi'
USER='flo-wit-admin'
PASS='flo-wit-1608'

if [ ! -d $TMPDIR ]
  then
    mkdir .okapi
fi
echo $TENANT > ${TMPDIR}/tenant
echo $OKAPI > ${TMPDIR}/url
curl -w '\n' ${OKAPI}${AUTHPATH} \
  -H 'content-type: application/json' \
  -H "x-okapi-tenant: ${TENANT}" \
  -d "{\"username\":\"${USER}\",\"password\":\"${PASS}\"}" \
  -D ${TMPDIR}/headers

grep 'x-okapi-token' ${TMPDIR}/headers | cut -f 2 -d ' ' > ${TMPDIR}/token
