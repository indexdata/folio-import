idir=/home/charles/nls/inv
wd=/home/charles/folio-import
inv2=$(wd)/inventory2

suppress-inst:
	cd $(inv2); node suppressInst-nls.js "$(idir)/bibs-suppress.jsonl"

inventory-prep:
	cd $(idir); cat bibs-xholdings.jsonl >> bibs-holdings.jsonl
	cd $(idir); cat bibs-xitems.jsonl >> bibs-items.jsonl
	cd $(idir); split -n l/5 bibs-instances.jsonl in
	cd $(idir); split -n l/5 bibs-srs.jsonl sr
	cd $(idir); split -n l/5 bibs-holdings.jsonl ho
	cd $(idir); split -n l/5 bibs-items.jsonl it
