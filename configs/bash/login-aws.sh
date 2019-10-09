#!/bin/bash

OKAPI='http://ec2-18-232-163-248.compute-1.amazonaws.com:9130'
TENANT='diku'
AUTHPATH='/bl-users/login'
TMPDIR='.okapi'

if [ ! -d $TMPDIR ]
  then
    mkdir .okapi
fi
echo $TENANT > ${TMPDIR}/tenant
echo $OKAPI > ${TMPDIR}/url
curl -w '\n' ${OKAPI}${AUTHPATH} -H 'content-type: application/json' -H "x-okapi-tenant: ${TENANT}" -d '{"username":"diku_admin","password":"admin"}' -D ${TMPDIR}/headers

grep 'x-okapi-token' ${TMPDIR}/headers | cut -f 2 -d ' ' > ${TMPDIR}/token
