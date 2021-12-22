#!/bin/bash

grep okapi: config.js
grep tenant: config.js

while true; do
    read -n 1 -p "Change config? (y/n) " change
    echo
    case $change in
        [Yy]* ) break;;
        [Nn]* ) echo "Config not changed."; exit;;
        * ) echo "Answer y or n.";;
    esac
done

options=$(ls configs/js)
select opt in $options
do
	cp configs/js/$opt config.js
	break
done

echo "Config set to:"
grep okapi: config.js
grep tenant: config.js
