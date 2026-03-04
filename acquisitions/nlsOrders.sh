#!/usr/bin/env bash

wd=../../nls
node nlsOrders $wd/ref-dev/acq $wd/dr1/data/z103.seqaa $wd/dr1/bibs-instances.jsonl $wd/orders
# node nlsOrders $wd/ref-dev/acq $wd/data/z103.seqaa $wd/inv/order-titles.jsonl $wd/orders