#!/bin/bash

TMP='./.okapi'
OKAPI=`cat ${TMP}/url`
TOKEN=`cat ${TMP}/token`
FILE=$1

if [ -z $FILE ]
  then
    echo "Usage: $0 <filename>"
    exit
fi

PL="{\"fileDefinitions\": [{\"name\": \"$FILE\"}]}"

curl --http1.1 -w '\n' "${OKAPI}/data-import/uploadDefinitions" \
  -H "x-okapi-token: ${TOKEN}" \
  -H "Content-type: application/json" \
  -d "${PL}"
