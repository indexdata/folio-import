#!/bin/bash

TMP='./.okapi'
OKAPI=`cat ${TMP}/url`
TOKEN=`cat ${TMP}/token`
ID=$1;

if [ -z $ID ] 
  then
    echo "Usage $0 <upload_definition_id>"
    exit
fi

curl --http1.1 -w '\n' -X DELETE "${OKAPI}/data-import/uploadDefinitions/${ID}" -H "x-okapi-token: ${TOKEN}"
