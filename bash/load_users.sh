#!/bin/bash

UFILE=$1;
if [ -z $UFILE ]
  then
    echo 'Usage: ./load.sh <users_file(s)>'
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
  echo '' >> 'log/users.log'
  echo $f >> 'log/users.log'
  curl --http1.1 "${OKAPI}/user-import" -H 'content-type: application/json' -H "x-okapi-token: ${TOKEN}" -d @$f
done
