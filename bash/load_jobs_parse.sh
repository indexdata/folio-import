#!/bin/bash

# This short script will take a glob of jobExcutions json files and create 
# source records.  See https://github.com/folio-org/mod-source-record-manager/blob/master/README.md

FILE=$2;
if [ -z $FILE ]
  then
    echo "Usage: ${0} <job_uuid> <rawRecordsDto_file>"
    exit
fi

JID=$1

TMP='./.okapi'
OKAPI=`cat ${TMP}/url`
TOKEN=`cat ${TMP}/token`

if [ ! -d 'log' ]
  then
    mkdir 'log'
fi

for f in ${@:2}; do
  echo "Loading ${f}"
  #echo '' >> 'log/jobs.log'
  #echo $f >> 'log/jobs.log'
  curl -w '\n' --http1.1 "${OKAPI}/change-manager/jobExecutions/${JID}/records" -H 'content-type: application/json' -H "x-okapi-token: ${TOKEN}" -d @$f
done
