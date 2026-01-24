#!/bin/bash

TMP='./.okapi'
OKAPI=`cat ${TMP}/url`
TOKEN=`cat ${TMP}/token`
FILE=$3
UPDEF=$1
FILEDEF=$2

if [ -z $FILE ]
  then
    echo "Usage: $0 <upload_def_id> <file_def_id> <filename>"
    exit
fi
if [ ! -f $FILE ]
  then
    echo "Can't find input file!"
    exit
fi

curl --http1.1 -w '\n' "${OKAPI}/data-import/uploadDefinitions/${UPDEF}/files/${FILEDEF}" \
  -H "x-okapi-token: ${TOKEN}" \
  -H "Content-type: application/octet-stream" \
  -d @$FILE
