#!/bin/bash

TMP='./.okapi'
OKAPI=`cat ${TMP}/url`
TOKEN=`cat ${TMP}/token`

INSTID=$1

if [ -z $INSTID ]
then
  echo "Usage: ${0} <instance_id>"
  exit
fi

EP="records-editor/records?externalId=${INSTID}"

if [ $2 ] 
then
  ID="/${2}"
fi

URL="${OKAPI}/${EP}"
curl --http1.1 -w '\n' -s $URL -H "x-okapi-token: ${TOKEN}"

# get version number from instance.
VER=`curl --http1.1 -w '\n' -s "${OKAPI}/instance-storage/instances/${INSTID}" -H "x-okapi-token: ${TOKEN}"`
echo $VER | sed -E 's/.*_version" *: *([0-9]*).*/"relatedRecordVersion": \1/' > /dev/stderr
