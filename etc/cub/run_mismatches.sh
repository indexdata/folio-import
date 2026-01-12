#!/bin/bash

UFILE=$1;

PDIR=/data/charles/colorado/patron-data
LOG=log
WAIT=30

mkdir -p $LOG

if [ -e _last ] 
then
	LAST=`sed -E 's/_[0-9]*\..*/_/' _last`
	echo "Matching on $LAST"
	for f in "$LAST*.json" 
	do
		echo $f
		node cubMismatchedUsers.js log $f
	done
fi
