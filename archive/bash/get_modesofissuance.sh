#!/bin/bash

TMP='./.okapi'
OKAPI=`cat ${TMP}/url`
TOKEN=`cat ${TMP}/token`

SRC=$1

if [ $SRC ] 
  then
    QUERY="query=source==${SRC}"
fi

curl --http1.1 -w '\n' "${OKAPI}/modes-of-issuance?limit=500&${QUERY}" -H "x-okapi-token: ${TOKEN}"
