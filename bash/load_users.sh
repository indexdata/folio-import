#!/bin/bash

UFILE=$1;
if [ -z $UFILE ]
  then
    echo 'Usage: ./load.sh <users_file>'
    exit
fi
if [ ! -f $UFILE ]
  then
    echo 'Users file not found'
    exit;
fi

TMP='./.okapi'
OKAPI=`cat ${TMP}/url`
TOKEN=`cat ${TMP}/token`

curl --http1.1 "${OKAPI}/user-import" -H 'content-type: application/json' -H "x-okapi-token: ${TOKEN}" -d @$UFILE
