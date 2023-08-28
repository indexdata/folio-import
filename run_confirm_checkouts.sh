#! /bin/bash

jscript="confirmLoad.js loan-storage/loans"
cof=$1
if [ ! $cof ] 
then
	echo "Usage: $0 <files>"
	exit
fi

for f in ${@:1}
do
	echo Running node $jscript $f$ctext
	log=$f.confirm.log
	node $jscript $f$ctext > $log &
done
