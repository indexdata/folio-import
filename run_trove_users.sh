#! /bin/bash

if [ ! $1 ] 
then
	echo "Usage: $0 <files>"
	exit
fi

for f in ${@:1}
do
	echo "Loading from $f"
	node loadTroveUsers $f
done
