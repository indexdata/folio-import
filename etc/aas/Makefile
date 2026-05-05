lib=aas
user=charles
home=/home/$(user)
wd=$(home)/folio-import
etc=$(wd)/etc/$(lib)
inv2=$(wd)/inventory2
acq=$(wd)/acquisitions
pat=$(wd)/patrons
util=$(wd)/util
conf=$(inv2)/conf/$(lib).json
login=$(wd)/configs/json/$(lib)-test.json
data=$(home)/$(lib)
ref=$(data)/ref
iref=$(ref)/inv
uref=$(ref)/usr
aref=$(ref)/acq
idir=$(data)/inv
udir=$(data)/usr
adir=$(data)/auth
cdir=$(data)/circ
odir=$(data)/ord
vdir=$(data)/org
in=$(data)/incoming
raw=$(in)/*Bib*mrc
mfhds=$(in)/*Holdings*mrc
mfile=$(idir)/bibs.mrc
izip=$(in)/*Full*zip
xlsx=$(in)/*Items*xlsx
csv=$(in)/*Items*csv
araw=$(in)/*Author*mrc
log=$(data)/log

instances: $(izip)
	cd $(in); unzip *Full*zip 
	cat $(in)/*Manifest*
	@read -p "Copy highest holdings ID value (hit Enter to continue) " c
	vi $(conf)
	rm -f $(mfile)
	ln -s $(raw) $(mfile)
	cat $(mfhds) >> $(mfile)
	cd $(inv2); node marc2inst2 $(conf) $(mfile) > $(log)/makeInst.log &
	tail -f $(log)/makeInst.log

items: $(xlsx)
	cd $(util); node xlsx2csv $(xlsx)
	wc -l $(csv)
	mv $(csv) $(idir)/items.csv
	cd $(inv2); node holdingsItems-aas $(conf) $(idir)/bibs-mfhds.jsonl > $(log)/makeHoldingsItems.log &
	tail -f $(log)/makeHoldingsItems.log


split-inventory:
	cd $(idir); split -l 120000 bibs-instances.jsonl in-
	cd $(idir); split -l 120000 bibs-srs.jsonl sr-
	cd $(idir); split -l 6000 bibs-presuc.jsonl pr-
	cd $(idir); split -l 125000 bibs-mfhds-holdings.jsonl ho-
	cd $(idir); split -l 110000 bibs-mfhds-items.jsonl it-
	cd $(idir); split -l 6500 bibs-mfhds-bwp.jsonl bw-
	cd $(idir); split -l 6000 bibs-mfhds-rel.jsonl re-

authorities: $(araw)
	cd $(adir); rm -f auth.mrc; ln -s $(araw) auth.mrc
	cd $(inv2); node marc2auth $(conf) $(adir)/auth.mrc > $(log)/makeAuth.log &
	tail -f $(log)/makeAuth.log

setup:
	cp $(login) $(wd)/config.json
	jq '. | .logpath="$(log)"' $(wd)/config.json > tmp
	mv tmp $(wd)/config.json
	mkdir -p $(ref)
	mkdir -p $(log)
	mkdir -p $(idir)
	mkdir -p $(adir)
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

