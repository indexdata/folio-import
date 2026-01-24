#!/bin/bash

# Usage: $./login.sh <config_file>
#
#         or
#
# Select a file from the configs/ directory
#
# The conf file should have OKAPI, TENANT, AUTHPATH, USER, and PASS variables defined.

vars='OKAPI TENANT AUTHPATH USER PASS'
TMPDIR=.okapi
CONF=$1


if [ ! $CONF ]
then
	PS3='Please enter your choice: '
	options=$(ls configs/)
	select opt in $options
	do
		CONF=configs/$opt
		break
	done
fi

for v in $vars
do
	export __$v=`grep $v $CONF | cut -d = -f 2 | sed "s/'//g"`
done

mkdir -p .okapi

echo $__TENANT > ${TMPDIR}/tenant
echo $__OKAPI > ${TMPDIR}/url
curl -w '\n' ${__OKAPI}${__AUTHPATH} \
  -H 'content-type: application/json' \
  -H "x-okapi-tenant: ${__TENANT}" \
  -d "{\"username\":\"${__USER}\",\"password\":\"${__PASS}\"}" \
  -D ${TMPDIR}/headers

if [ $__AUTHPATH == '/bl-users/login-with-expiry' ]; then
	grep -o 'folioAccessToken=[^;]*' ${TMPDIR}/headers | cut -d '=' -f 2 > ${TMPDIR}/token
else
	grep 'x-okapi-token' ${TMPDIR}/headers | cut -f 2 -d ' ' > ${TMPDIR}/token
fi
