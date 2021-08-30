#! /bin/bash

EP=$1
if [ ! $2 ] 
then
	echo "Usage: $0 <endpoint> <files>"
	exit
fi

for f in ${@:2}
do
	LNAME=$(echo $f | sed -E 's/^.*\///')	
	node deleteByEndpoint.js $EP $f > log/$LNAME.log 2>log/$LNAME.err &
done
