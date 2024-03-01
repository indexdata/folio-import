lib=emmanuel
home=/home/charles
data=$(home)/$(lib)
invdir=$(data)/inv
mfile=$(invdir)/bibs.mrc
log=$(data)/log
wd=$(home)/folio-import
iref=$(data)/ref/inv
aref=$(data)/ref/acq
rules=$(wd)/mapping-rules/default.json

inventory: $(mfile)
ifeq ($(wildcard $(iinfo)),)
	cd $(wd)/util; node xlsx2csv.js $(ifile) tsv
endif
	./marc2inst-lane.pl $(rules) $(iref) $(mfile) > $(log)/make-marc.log 2>$(log)/make-marc-err.log &

clean-inventory: $(iinfo)
	rm $(invdir)/*.tsv

setup:
	cd $(wd); git pull	
	cp $(wd)/configs/bash/login-$(lib)-test.sh .
	cp $(wd)/bash/reference_* .
	cp $(wd)/inventory/marc2inst-$(lib).pl .
	mkdir -p $(iref)
	mkdir -p $(aref)
	mkdir -p $(log)
	./login-*.sh
	./reference_inventory.sh $(iref)
	./reference_acq.sh $(aref)

clean:
	rm -rf $(iref)
	rm -rf $(uref)
	rm -rf $(aref)
	rm marc2inst-lane.pl
	rm reference_*
	rm login-stanford.sh
