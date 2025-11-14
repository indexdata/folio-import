#!/usr/bin/env bash

pd=/Users/charles/Folio/nls
dir=circ
ext=dsv
DEBUG=1 node nlsCirc $pd/ref-dev/inv/service-points.json $pd/$dir/users.jsonl $pd/$dir/items.jsonl $pd/$dir/z36.$ext $pd/$dir/z310.bak $pd/$dir/z37.$ext