#!/usr/bin/env bash

pd=/Users/charles/Folio/nls
dir=circTest
ext=seqaa
DEBUG=1 node nlsCirc $pd/ref-dev/inv/service-points.json $pd/$dir/users.jsonl $pd/$dir/items.jsonl $pd/$dir/z36.$ext $pd/$dir/z310.$ext $pd/$dir/z37.$ext