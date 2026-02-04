#!/bin/bash

TMP='./.okapi'
OKAPI=`cat ${TMP}/url`
TOKEN=`cat ${TMP}/token`

Q=$1

curl --http1.1 -w '\n' "${OKAPI}/scheduled-notice-storage/scheduled-notices${Q}" -H "x-okapi-token: ${TOKEN}"
