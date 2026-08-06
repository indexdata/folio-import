#!/usr/bin/env bash

wd=../../nls
node nlsOrders $wd/ref-dev/acq $wd/dr3/z103.seqaa $wd/dr3/inv/bibs-instances.jsonl $wd/dr3/orders
# node nlsOrders $wd/ref-dev/acq $wd/data/z103.seqaa $wd/inv/order-titles.jsonl $wd/orders