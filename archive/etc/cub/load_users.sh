#!/bin/bash

UFILE=$1;

TMP='./.okapi'
OKAPI=`cat ${TMP}/url`
TOKEN=`cat ${TMP}/token`

PDIR=/data/charles/colorado/patron-data
LOG=log
WAIT=30

mkdir -p $LOG

if [ -e _last ] 
then
	LAST=`cat _last`
	FILES=`find $PDIR/*.json -newer $LAST` 
	echo $FILES
	echo "Finding files newer than $LAST"
fi
if [ $UFILE ]
then
	FILES="$UFILE"
fi

for f in $FILES; do
  NOW=$(date -u "+%Y-%m-%d %H:%M:%S")
  BN=`basename $f .json`
  URL="${OKAPI}/user-import"
  echo "${NOW} Loading ${f}"
  echo "POST $URL"
  echo '' >> "$LOG/users.log"
  echo $f >> "$LOG/users.log"
  curl --http1.1 $URL -H 'content-type: application/json' -H "x-okapi-token: ${TOKEN}" -d @$f > "$LOG/$BN.log";
  echo "$f" > _last
  echo "Sleeping for $WAIT secs..."
  sleep $WAIT
done
