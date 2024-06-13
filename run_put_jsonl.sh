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
	echo "View info at log/${LNAME}.info"
	node putJSONL.js $EP $f > log/$LNAME.info &
done
