#!/bin/bash

TMP='./.okapi'
OKAPI=`cat ${TMP}/url`
TOKEN=`cat ${TMP}/token`

if [ $1 ] 
  then
  Q="&query=${1}"
fi

curl --http1.1 -w '\n' "${OKAPI}/circulation/requests?limit=1000${Q}" -H "x-okapi-token: ${TOKEN}"
