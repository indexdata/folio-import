#!/bin/bash

TMP='./.okapi'
OKAPI=`cat ${TMP}/url`
TOKEN=`cat ${TMP}/token`

curl --http1.1 -w '\n' "${OKAPI}/configurations/entries?limit=1000" -H "x-okapi-token: ${TOKEN}"
