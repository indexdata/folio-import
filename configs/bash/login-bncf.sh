#!/bin/bash

OKAPI='https://okapi-snd-eu-central-1.folio.ebsco.com'
TENANT='fs00001013'
AUTHPATH='/bl-users/login'
TMPDIR='.okapi'
USER='admin'
PASS='bncfP@$$woRd'

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
