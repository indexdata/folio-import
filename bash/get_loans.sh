#!/bin/bash

TMP='./.okapi'
OKAPI=`cat ${TMP}/url`
TOKEN=`cat ${TMP}/token`

curl -w '\n' --http1.1 "${OKAPI}/circulation/loans?query=item.barcode=*" -H "x-okapi-token: ${TOKEN}"
