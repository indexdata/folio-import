#!/bin/bash

TMP='./.okapi'
OKAPI=`cat ${TMP}/url`
TOKEN=`cat ${TMP}/token`

echo "Enter status (committed|error|parsing_in_progress): "
read ST 

if [ $ST ] 
  then
    QUERY="query=(status==(${ST}))"
fi

curl --http1.1 -w '\n' "${OKAPI}/metadata-provider/jobExecutions?limit=100&${QUERY}" -H "x-okapi-token: ${TOKEN}"
