#!/bin/bash

TMP='./.okapi'
OKAPI=`cat ${TMP}/url`
TOKEN=`cat ${TMP}/token`

curl -w '\n' --http1.1 "${OKAPI}/search/index/inventory/reindex" -H 'content-type: application/json' -H "x-okapi-token: ${TOKEN}" -d ''
