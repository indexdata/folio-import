#!/bin/bash

TMP='./.okapi'
OKAPI=`cat ${TMP}/url`
TOKEN=`cat ${TMP}/token`

ID=$1

curl --http1.1 -w '\n' "${OKAPI}/authn/credentials/${ID}" -H "x-okapi-token: ${TOKEN}"
