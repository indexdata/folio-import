#!/bin/bash

OKAPI='https://folio-snapshot-okapi.dev.folio.org'
TMPDIR='.okapi'
TENANT=`cat $TMPDIR/tenant`
TOKEN=`cat $TMPDIR/token`
RTOKEN=`cat $TMPDIR/rtoken`
AUTHPATH='/authn/refresh'

curl -w '\n' ${OKAPI}${AUTHPATH} \
  -H 'content-type: application/json' \
  -H "x-okapi-tenant: ${TENANT}" \
  -H "cookie: ${RTOKEN}" \
  -d "{}" \
  -D ${TMPDIR}/headers

grep -o 'folioAccessToken=.*' .okapi/headers > $TMPDIR/token
grep -o 'folioRefreshToken=.*' .okapi/headers > $TMPDIR/rtoken
