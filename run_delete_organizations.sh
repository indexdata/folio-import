#! /bin/bash
T=$1

if [ ! $T ] 
then
	echo "Usage: $0 <tenant>"
	exit
fi

TF=`grep "'$T'" config.js`

if [ ! "$TF" ] 
then
	echo "ERROR ${T} not found in config.js!"
	exit
fi

node deleteByEndpoint.js organizations-storage/organizations
node deleteByEndpoint.js organizations-storage/contacts
node deleteByEndpoint.js organizations-storage/interfaces
