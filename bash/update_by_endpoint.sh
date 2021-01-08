#!/bin/bash

TMP='./.okapi'
OKAPI=`cat ${TMP}/url`
TOKEN=`cat ${TMP}/token`

EP=$1;
UFILE=$2;
if [ -z $UFILE ]
  then
    echo 'Usage: ./update_by_endpoint <endpoint> <jsonl_file>'
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
    UUID=`echo $line | grep -E -o '"id":".+?"' | grep -E -o -m 1 '........-....-....-....-............'`
    echo "Updating # ${LN} -- ${UUID}"
    curl -w '\n' -X PUT --http1.1 "${OKAPI}/${EP}/${UUID}" -H 'content-type: application/json' -H "x-okapi-token: ${TOKEN}" -d "$line"
    LN=$(expr $LN + 1)
done < $UFILE

