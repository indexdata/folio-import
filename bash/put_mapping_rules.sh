#!/bin/bash

# This short script will take a glob of jobExcutions json files and create 
# source records.  See https://github.com/folio-org/mod-source-record-manager/blob/master/README.md

FILE=$2
TYPE=$1
if [ -z $FILE ]
  then
    echo "Usage: ${0} <type: marc-bib, marc-holdings, marc-authority> <mapping-rules-file>"
    exit
fi

TMP='./.okapi'
OKAPI=`cat ${TMP}/url`
TOKEN=`cat ${TMP}/token`

if [ ! -d 'log' ]
  then
    mkdir 'log'
fi

curl --http1.1 -X PUT "${OKAPI}/mapping-rules/${TYPE}" -H 'content-type: application/json' -H "x-okapi-token: ${TOKEN}" -d @$FILE
