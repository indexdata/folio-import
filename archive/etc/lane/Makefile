home=/Users/charles/Folio
data=$(home)/lane
invdir=$(data)/inv
mfile=$(invdir)/lane-bibs-and-mfhds.mrc
ifile=$(invdir)/lane-item-info.xlsx
iinfo=$(invdir)/item_info.tsv
orddir=$(data)/orders
titles=$(orddir)/titles.jsonl
pieces=$(orddir)/SERIAL_ISSUES.csv
circdir=$(home)/sul/lane
cfile=$(circdir)/Circ*xlsx
log=$(data)/log
wd=$(home)/folio-import
iref=$(data)/inv-ref
aref=$(data)/acq-ref
rules=$(wd)/etc/lane/mapping-rules.json

inventory: $(mfile) $(ifile)
ifeq ($(wildcard $(iinfo)),)
	cd $(wd)/util; node xlsx2csv.js $(ifile) tsv
endif
	./marc2inst-lane.pl $(rules) $(iref) $(mfile) > $(log)/make-marc.log 2>$(log)/make-marc-err.log &

clean-inventory: $(iinfo)
	rm $(invdir)/*.tsv

circ: $(cfile)
	cd $(wd)/util; node xlsx2csv.js $(cfile)

pieces: $(pieces)
ifeq ($(wildcard $(titles)),)
	cd $(wd); grep sul config.js
	cd $(wd); node downloadJSONL.js orders-storage/titles $(titles)
endif
	cd $(wd)/acquisitions; node lanePieces.js $(titles) $(pieces)

setup:
	cd $(wd); git pull	
	cp $(wd)/configs/bash/login-stanford.sh .
	cp $(wd)/bash/reference_* .
	cp $(wd)/inventory/marc2inst-lane.pl .
	mkdir -p $(iref)
	mkdir -p $(aref)
	mkdir -p $(log)
	./login-stanford.sh
	./reference_inventory.sh $(iref)
	./reference_finance.sh $(aref)
	./reference_acq.sh $(aref)
	./reference_org.sh $(aref)

clean:
	rm -rf $(iref)
	rm -rf $(uref)
	rm -rf $(aref)
	rm marc2inst-lane.pl
	rm reference_*
	rm login-stanford.sh
