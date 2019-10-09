#!/bin/bash

TMP='./.okapi'
OKAPI=`cat ${TMP}/url`
TOKEN=`cat ${TMP}/token`

if [ $1 ] 
  then
    QUERY=$1
fi

curl --http1.1 -w '\n' "${OKAPI}/source-storage/formattedRecords/${QUERY}?identifier=INSTANCE" -H "x-okapi-token: ${TOKEN}"
