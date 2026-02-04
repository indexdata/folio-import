#!/bin/bash

TMP='./.okapi'
OKAPI=`cat ${TMP}/url`
TOKEN=`cat ${TMP}/token`
ID=$1;

if [ -z $ID ] 
  then
    echo "Usage $0 <user_id>"
    exit
fi

curl --http1.1 -w '\n' -X DELETE "${OKAPI}/users/${ID}" -H "x-okapi-token: ${TOKEN}"

PRES=`curl -s --http1.1 -w '\n' "${OKAPI}/perms/users/?query=userId==${ID}" -H "x-okapi-token: ${TOKEN}"`
PID=`echo $PRES | grep -o '"id":"[^"]*' | grep -o "........-....-....-....-............"`

echo "Deleting $PID from perms/users"
curl --http1.1 -w '\n' -X DELETE "${OKAPI}/perms/users/${PID}" -H "x-okapi-token: ${TOKEN}"
