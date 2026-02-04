#!/bin/bash

# This short script will take a glob of jobExcutions json files and create 
# source records.  See https://github.com/folio-org/mod-source-record-manager/blob/master/README.md


TMP='./.okapi'
OKAPI=`cat ${TMP}/url`
TOKEN=`cat ${TMP}/token`

curl --http1.1 -X PUT "${OKAPI}/mapping-rules/restore" -H 'content-type: application/json' -H "x-okapi-token: ${TOKEN}" -d ''
