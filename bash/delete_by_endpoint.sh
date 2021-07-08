#!/bin/bash

TMP='./.okapi'
OKAPI=`cat ${TMP}/url`
TOKEN=`cat ${TMP}/token`

EP=$1;
UFILE=$2;
if [ -z $UFILE ]
  then
    echo 'Usage: ./update_by_endpoint <endpoint> <jsonl_file>'
    exit
fi
if [ ! -f $UFILE ]
  then
    echo 'File not found'
    exit
fi

LN=1;
while IFS= read -r line
  do
    UUID=`echo $line | sed -E 's/.*"id":"([^"]*).*/\1/'`
    echo "Deleting # ${LN} -- ${UUID}"
    curl -w '\n' -X DELETE --http1.1 "${OKAPI}/${EP}/${UUID}" -H "x-okapi-token: ${TOKEN}" 
    LN=$(expr $LN + 1)
done < $UFILE

