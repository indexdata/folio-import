#! /bin/bash

if [ ! $1 ] 
then
	echo "Usage: $0 <files>"
	exit
fi

for f in $@
do
	LNAME=$(echo $f | sed -E 's/^.*\///')	
	node loadInventorySyncJSONL.js $f > log/$LNAME.info &
done
