lib=steu
user=charles
home=/home/$(user)
wd=$(home)/folio-import
etc=$(wd)/etc/$(lib)
inv2=$(wd)/inventory2
conf=$(inv2)/conf/$(lib).json
login=$(wd)/configs/json/$(lib).json
data=$(home)/$(lib)
ref=$(data)/ref
iref=$(ref)/inv
uref=$(ref)/usr
idir=$(data)/inv
udir=$(data)/usr
adir=$(data)/auth
cdir=$(data)/circ
in=$(data)/incoming
mfile=$(idir)/bibs.mrc
log=$(data)/log

instances: $(in)/*.mrc
	cd $(idir); cat $(in)/*.mrc > raw.marc
	@echo Converting $(mfile) to utf8...
	yaz-marcdump -f marc8 -t utf8 -l 9=97 -o marc $(idir)/raw.marc > $(mfile)
	yaz-marcdump $(mfile) | grep -P '^\d{5}' -c > $(idir)/count.bibs
	cat $(idir)/count.bibs
	cd $(inv2); node marc2inst.js $(conf) $(mfile) > $(log)/makeInst.log &
	tail -f $(log)/makeInst.log


items: $(idir)/bibs-mfhds.jsonl
	cd $(inv2); node holdingsItems-steu.js $(conf) $(idir)/bibs-mfhds.jsonl > $(log)/makeHoldingsItems.log
	cat $(log)/makeHoldingsItems.log

split-instances: $(idir)/bibs-instances.jsonl
	cd $(idir); split -l 65000 bibs-instances.jsonl inst
	cd $(idir); split -l 65000 bibs-srs.jsonl srs
	ls $(idir)

users: $(in)/users.csv
	cp $(in)/users.csv $(udir)/users.csv
	cd $(wd)/patrons; node steuUsers $(uref) $(udir)/users.csv > $(log)/makeUsers.log
	cat $(log)/makeUsers.log

XXXcheckouts: $(in)/check*xls
	cp $(in)/check*xls $(cdir)/loans.xls
	cd $(wd)/util/; node xlsx2csv.js $(cdir)/loans.xls
	cd $(cdir); mv *books.csv loans.csv
	cd $(wd); ./get_circ_requirements.sh $(cdir)
	cd $(wd)/patrons; node deraCheckouts $(cdir)/loans.csv > $(log)/makeCheckouts.log
	cat $(log)/makeCheckouts.log

setup:
	cp $(login) $(wd)/config.json
	# sed -e 's#"logpath":.*#"logpath": "$(log)",#' $(wd)/config.json > tmp
	jq '. | .logpath="$(log)"' $(wd)/config.json > tmp
	mv tmp $(wd)/config.json
	mkdir -p $(ref)
	mkdir -p $(log)
	mkdir -p $(idir)
	mkdir -p $(udir)
	mkdir -p $(adir)
	mkdir -p $(cdir)
	mkdir -p $(in)
	cd $(wd); node migrationRef.js $(ref)
	cd $(etc); cp *.tsv $(iref);

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

