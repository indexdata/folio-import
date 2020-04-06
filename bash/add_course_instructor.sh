#!/bin/bash

TMP='./.okapi'
OKAPI=`cat ${TMP}/url`
TOKEN=`cat ${TMP}/token`

ID=$1
UFILE=$2;
if [ -z $UFILE ]
  then
    echo "Usage: ${0} <courselisting_id> <instructor_file>"
    exit
fi
if [ ! -f $UFILE ]
  then
    echo 'File not found'
    exit;
fi

curl -w '\n' --http1.1 "${OKAPI}/coursereserves/courselistings/${ID}/instructors" -H 'content-type: application/json' -H "x-okapi-token: ${TOKEN}" -d @$UFILE
