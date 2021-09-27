#!/bin/bash

TMP='./.okapi'
OKAPI=`cat ${TMP}/url`
TOKEN=`cat ${TMP}/token`
TENANT=`cat ${TMP}/tenant`

curl --http1.1 -w '\n' -s "${OKAPI}/_/proxy/tenants/${TENANT}/modules$1" -H "x-okapi-token: ${TOKEN}"
