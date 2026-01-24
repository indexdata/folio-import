#!/bin/bash

TMP='./.okapi'
OKAPI=`cat ${TMP}/url`
TOKEN=`cat ${TMP}/token`

curl --http1.1 -w '\n' "${OKAPI}/instance-storage/instances?limit=500" -H "x-okapi-token: ${TOKEN}"
