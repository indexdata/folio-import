#!/bin/bash

TMP='./.okapi'
OKAPI=`cat ${TMP}/url`
TOKEN=`cat ${TMP}/token`

Q=$1

curl --http1.1 -w '\n' "${OKAPI}/loan-storage/loans${Q}" -H "x-okapi-token: ${TOKEN}"
