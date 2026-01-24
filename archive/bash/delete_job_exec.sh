#!/bin/bash

# This short script will take a glob of jobExcutions json files and delete 
# source records.  See https://github.com/folio-org/mod-source-record-manager/blob/master/README.md

JID=$1
if [ ! $JID ]
  then
    echo "Usage: ${0} <job_uuid>"
    exit
fi

TMP='./.okapi'
OKAPI=`cat ${TMP}/url`
TOKEN=`cat ${TMP}/token`

curl -w '\n' --http1.1 -X DELETE -D - "${OKAPI}/change-manager/jobExecutions/${JID}/records" -H 'content-type: application/json' -H "x-okapi-token: ${TOKEN}" -H "accept: text/plain"
