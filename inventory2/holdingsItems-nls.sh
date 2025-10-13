#!/usr/bin/env bash

wd=../../nls
node --max-old-space-size=4096 holdingsItems-nls conf/nls-dev.json $wd/big/bibs.map -s 72