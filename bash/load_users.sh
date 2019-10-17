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

if [ ! -d '/data/folio-data/done' ]
  then
    mkdir '/data/folio-data/done'
fi

if [ ! -d 'log' ]
  then
    mkdir 'log'
fi

for f in ${BASH_ARGV[*]}; do
  echo "Loading ${f}"
  echo '' >> 'log/users.log'
  echo $f >> 'log/users.log'
  curl --http1.1 "${OKAPI}/user-import" -H 'content-type: application/json' -H "x-okapi-token: ${TOKEN}" -d @$f >> 'log/users.log'
  mv $f '/data/folio-data/done'
done
