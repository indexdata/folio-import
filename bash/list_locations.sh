#!/bin/bash

TMP='./.okapi'
OKAPI=`cat ${TMP}/url`
TOKEN=`cat ${TMP}/token`

curl --http1.1 -v -w '\n' "${OKAPI}/locations" -H "x-okapi-token: ${TOKEN}"
