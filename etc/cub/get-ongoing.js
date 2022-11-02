#!/bin/bash

if [ ! $1 ] 
then
	echo "Usage $0 <orders.json_file>"
	exit
fi

jq '. | select(.fixedFields."20".value? | match("[fz]")) | select(.fixedFields."15".value? | match("[dnoqs]"))' $1 -c
