#!/bin/bash
TMP='./.okapi'
OKAPI=`cat ${TMP}/url`
TOKEN=`cat ${TMP}/token`

UFILE=$1;
if [ -z $UFILE ]
  then
    echo 'Usage: ./checkout.sh <checkout_file>'
    exit
fi
if [ ! -f $UFILE ]
  then
    echo 'Checkout file not found'
    exit;
fi

ID=`cat $UFILE | grep -oE -m 1 '"id".*?".+?"' | grep -oE '[a-z0-9-]{8,}'`
echo $ID

curl -w '\n' --http1.1 -X PUT -v "${OKAPI}/circulation/loans/${ID}" -H 'content-type: application/json' -H "x-okapi-token: ${TOKEN}" -d @$UFILE
