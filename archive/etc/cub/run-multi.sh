#!/bin/bash

for f in ${@:4}
do
	$1 $2 $3 $f > $f.log &
done
