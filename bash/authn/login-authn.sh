#!/bin/bash

OKAPI='https://folio-snapshot-okapi.dev.folio.org'
TENANT='diku'
AUTHPATH='/authn/login-with-expiry'
TMPDIR='.okapi'
USER='diku_admin'
PASS='admin'

if [ ! -d $TMPDIR ]
  then
    mkdir $TMPDIR
fi

echo $TENANT > ${TMPDIR}/tenant
echo $OKAPI > ${TMPDIR}/url
curl -w '\n' ${OKAPI}${AUTHPATH} \
  -H 'content-type: application/json' \
  -H "x-okapi-tenant: ${TENANT}" \
  -d "{\"username\":\"${USER}\",\"password\":\"${PASS}\"}" \
  -D ${TMPDIR}/headers

grep -o 'folioAccessToken=.*' .okapi/headers > $TMPDIR/token
grep -o 'folioRefreshToken=.*' .okapi/headers > $TMPDIR/rtoken
