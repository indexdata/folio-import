#!/bin/bash

if [ -z $1 ] 
then
	echo "Usage: $0 <configuration_file>"
	exit
fi

jq '.configs[] | select(.configName=="saml" or .configName=="email" or .module=="USERSBL" or .module=="NCIP" or .module=="edge-sip2" or .module=="ORDERS")' $1 -c
