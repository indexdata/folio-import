jq '.budgets[] | .encumbered=0 | .unavailable=0 | .overEncumbrance=0 | .allocated=.initialAllocation | .available=.allocated' $1 -c
