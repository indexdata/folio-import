#!/bin/bash

OKAPI='https://okapi-uchicago.folio-dev.indexdata.com'
TENANT='uchicago'
AUTHPATH='/bl-users/login'
TMPDIR='.okapi'
USER='uchicago-admin'
PASS='uchicago-0710'

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
