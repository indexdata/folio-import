#!/bin/bash

if [ -z $1 ] 
then
	echo "Usage: $0 <configuration_file>"
	exit
fi

jq '.configs[] | select(.configName=="saml" or .configName=="email" or .module=="USERSBL")' $1 -c