#!/bin/bash

TMP='./.okapi'
OKAPI=`cat ${TMP}/url`
TOKEN=`cat ${TMP}/token`

EP=source-storage/snapshots
UFILE=$1;
if [ -z $UFILE ]
  then
    echo 'Usage: ./update_snapshots <jsonl_file>'
    exit
fi
if [ ! -f $UFILE ]
  then
    echo 'File not found'
    exit
fi

LN=1;
while IFS= read -r line
  do
    echo "Updating # ${LN}"
    UUID=`echo $line | grep -E -o '"jobExecutionId":".+?"' | grep -E -o -m 1 '........-....-....-....-............'`
    echo $line > .okapi/payload
    curl -w '\n' -X PUT --http1.1 "${OKAPI}/${EP}/${UUID}" -H 'content-type: application/json' -H "x-okapi-token: ${TOKEN}" -d @.okapi/payload
    LN=$(expr $LN + 1)
done < $UFILE

