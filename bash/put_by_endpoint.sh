#!/bin/bash

EP=$1
FILE=$2
if [ -z $FILE ]
  then
    echo "Usage: ${0} <endpoint> <record>"
    exit
fi

TMP='./.okapi'
OKAPI=`cat ${TMP}/url`
TOKEN=`cat ${TMP}/token`

curl -v --http1.1 -X PUT "${OKAPI}/${EP}" -H 'content-type: application/json' -H "x-okapi-token: ${TOKEN}" -d @$FILE
