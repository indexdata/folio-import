lib=ba
user=charles
home=/home/$(user)
wd=$(home)/folio-import
etc=$(wd)/etc/$(lib)
inv2=$(wd)/inventory2
acq=$(wd)/acquisitions
pat=$(wd)/patrons
conf=$(inv2)/conf/$(lib).json
login=$(wd)/configs/json/$(lib).json
data=$(home)/$(lib)
ref=$(data)/ref
iref=$(ref)/inv
uref=$(ref)/usr
aref=$(ref)/acq
fref=$(ref)/fin
idir=$(data)/inv
udir=$(data)/usr
adir=$(data)/auth
cdir=$(data)/circ
odir=$(data)/ord
vdir=$(data)/org
fdir=$(data)/fin
in=$(data)/incoming
raw=$(in)/*export*mrc
mfile=$(idir)/bibs.mrc
mfhds=$(idir)/bibs-mfhds.jsonl
log=$(data)/log

instances: $(raw)
	cd $(idir); rm -r $(mfile); ln -s $(raw) $(mfile)
	cd $(inv2); node marc2inst $(conf) $(mfile) > $(log)/makeInst.log &
	tail -f $(log)/makeInst.log

items: $(mfhds)
	cp $(in)/*items*csv $(idir)/items.csv
	cd $(inv2); node holdingsItems-ba $(conf) $(mfhds) $(idir)/items.csv > $(log)/makeHoldingsItems.log &
	tail -f $(log)/makeHoldingsItems.log

split-inventory:
	cd $(idir); split -l 100000 bibs-instances.jsonl in-
	cd $(idir); split -l 100000 bibs-srs.jsonl sr-
	cd $(idir); split -l 1500 bibs-presuc.jsonl pr-
	cd $(idir); split -l 100000 bibs-mfhds-holdings.jsonl ho-
	cd $(idir); split -l 130000 bibs-mfhds-items.jsonl it-
	cd $(idir); split -l 6500 bibs-mfhds-bwp.jsonl bw-
	cd $(idir); split -l 6000 bibs-mfhds-rel.jsonl re-

authorities: $(in)/*auth*mrc
	cd $(adir); rm -r auth.mrc; ln -s $(in)/*auth*mrc auth.mrc
	cd $(inv2); node marc2auth $(conf) $(adir)/auth.mrc > $(log)/makeAuth.log &
	tail -f $(log)/makeAuth.log

split-authorities:
	cd $(adir); split -l 75000 auth-authorities.jsonl aua-
	cd $(adir); split -l 75000 auth-srs.jsonl aus-

finance: $(in)/*funds*.csv
	cp $(in)/*funds*.csv $(fdir)/funds.csv
	cd $(acq); node baFunds $(fref) $(fdir)/funds.csv > $(log)/makeFunds.log
	cat $(log)/makeFunds.log
	
setup:
	cp $(login) $(wd)/config.json
	jq '. | .logpath="$(log)"' $(wd)/config.json > tmp
	mv tmp $(wd)/config.json
	mkdir -p $(ref)
	mkdir -p $(log)
	mkdir -p $(idir)
	mkdir -p $(adir)
	mkdir -p $(fdir)
	mkdir -p $(in)
	cd $(wd); node migrationRef.js $(ref)

clean:
	rm -rf $(ref)

really-clean:
	rm -rf $(ref)
	rm -rf $(log)
	rm -rf $(idir)
	rm -rf $(udir)
	rm -rf $(adir)
	rm -rf $(cdir)
	rm -rf $(in)
	rm -rf $(odir)
	rm -rf $(vdir)

