#!/bin/bash

TMP='./.okapi'
OKAPI=`cat ${TMP}/url`
TOKEN=`cat ${TMP}/token`

curl --http1.1 -w '\n' -X DELETE "${OKAPI}/instance-types" -H "x-okapi-token: ${TOKEN}"
