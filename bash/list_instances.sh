#!/bin/bash

TMP='./.okapi'
OKAPI=`cat ${TMP}/url`
TOKEN=`cat ${TMP}/token`

if [ $1 ] 
  then
  Q="&query=${1}"
fi

curl --http1.1 -w '\n' "${OKAPI}/instance-storage/instances?limit=100${Q}" -H "x-okapi-token: ${TOKEN}"
