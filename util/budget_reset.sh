jq '.budgets[] | .expenditures=0 | .encumbered=0 | .unavailable=0 | .overEncumbrance=0 | .initialAllocation=0 | .available=.allocated | .cashBalance=.allocated' $1 -c
