#!/bin/bash

TMP='./.okapi'
OKAPI=`cat ${TMP}/url`
TOKEN=`cat ${TMP}/token`
TENANT=`cat ${TMP}/tenant`

if [ ! $1 ] 
  then
  echo "Usage: $0 <endpoint>"
  exit
fi

EP=$1

JSON=`curl --http1.1 -w '\n' -s "${OKAPI}/${EP}?limit=0" -H "x-okapi-token: ${TOKEN}" -H "x-okapi-tenant: ${TENANT}"`
echo $JSON | sed -E 's/.*"totalRecords": ([0-9]+).*/\1/'
