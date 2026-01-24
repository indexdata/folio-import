#!/bin/bash

UFILE=$1;
if [ -z $UFILE ]
  then
    echo 'Usage: ./load_requests_batch.sh <requests file>'
    exit
fi

TMP='./.okapi'
OKAPI=`cat ${TMP}/url`
TOKEN=`cat ${TMP}/token`

if [ ! -d 'log' ]
  then
    mkdir 'log'
fi

for f in ${BASH_ARGV[*]}; do
  NOW=$(date -u "+%Y-%m-%d %H:%M:%S")
  echo "${NOW} Loading ${f}"
  echo '' >> 'log/requests.log'
  echo $f >> 'log/requests.log'
  curl -v -w '\n' --http1.1 "${OKAPI}/request-storage-batch/requests" -H 'content-type: application/json' -H "x-okapi-token: ${TOKEN}" -d @$f
done
