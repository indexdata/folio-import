#! /bin/bash

jscript=checkoutByBarcode.js
cof=$1
if [ ! $cof ] 
then
	echo "Usage: $0 <files>"
	exit
fi
if [ $CHECKIN ] 
then
	ctext=" 0 checkin"
fi

for f in ${@:1}
do
	echo Running node $jscript $f$ctext
	log=$f.log
	elog=$f.err
	node $jscript $f$ctext > $log 2>$elog &
done
