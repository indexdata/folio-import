#!/bin/bash

TMP='./.okapi'
OKAPI=`cat ${TMP}/url`
TOKEN=`cat ${TMP}/token | sed 's/.$//'`

PS3="Choose one: "
EPS="reservoir/clusters reservoir/records reservoir/oai reservoir/config/modules"
getopts pdo OPTS
select EP in $EPS
do
	echo $EP
	break
done

URL="${OKAPI}/${EP}"
if [ $OPTS == d ]
then
	echo "curl --http1.1 -w '\n' '$URL'"
fi

HEAD="x-okapi-token: ${TOKEN}"
if [ $OPTS == p ]
then
	curl --http1.1 -w '\n' -s $URL -H "$HEAD" | jq .
else
	curl --http1.1 -w '\n' -s $URL -H "$HEAD" 
fi
