#!/usr/bin/env bash

wd=../../nls/dr4
node nlsOrders $wd/ref/acq $wd/dryrun4-data/z103.seqaa $wd/inv/bibs-instances.jsonl $wd/orders
# node nlsOrders $wd/ref-dev/acq $wd/data/z103.seqaa $wd/inv/order-titles.jsonl $wd/orders