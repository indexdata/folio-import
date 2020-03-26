#!/bin/bash

TMP='./.okapi'
OKAPI=`cat ${TMP}/url`
TOKEN=`cat ${TMP}/token`

UFILE=$1;
if [ -z $UFILE ]
  then
    echo 'Usage: ./add_identifier_type.sh <identifier_type_record>'
    exit
fi
if [ ! -f $UFILE ]
  then
    echo 'File not found'
    exit;
fi

curl -w '\n' --http1.1 "${OKAPI}/identifier-types" -H 'content-type: application/json' -H "x-okapi-token: ${TOKEN}" -d @$UFILE
