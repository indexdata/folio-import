#!/usr/bin/env bash

wd=../../nls/dr5
node --max-old-space-size=4096 nlsOrders $wd/ref/acq $wd/dryrun5-data/z103.seqaa $wd/inv/bibs-instances.jsonl $wd/orders
# node nlsOrders $wd/ref-dev/acq $wd/data/z103.seqaa $wd/inv/order-titles.jsonl $wd/orders