#!/bin/bash

TMP='./.okapi'
OKAPI=`cat ${TMP}/url`
TOKEN=`cat ${TMP}/token`

if [ ! $1 ] 
  then
  echo "Usage: $0 <endpoint>"
  exit
fi

EP=$1

curl --http1.1 -w '\n' "${OKAPI}/${EP}?limit=0" -H "x-okapi-token: ${TOKEN}"
