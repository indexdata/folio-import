lib=dera
user=charles
home=/home/$(user)
wd=$(home)/folio-import
etc=$(wd)/etc/$(lib)
inv2=$(wd)/inventory2
conf=$(inv2)/conf/dera.json
login=$(wd)/configs/json/dera-test.json
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

inventory: $(in)/*Bibs*out
	cd $(idir); rm -r raw.marc; ln -s $(in)/*Bibs*out raw.marc
	@echo Converting $(mfile) to utf8...
	yaz-marcdump -f marc8 -t utf8 -l 9=97 -o marc $(idir)/raw.marc > $(mfile)
	yaz-marcdump $(mfile) | grep -P '^\d{5}' -c > $(idir)/count.bibs
	cat $(idir)/count.bibs
	cd $(inv2); node marc2inst-dera $(conf) $(mfile) > $(log)/makeInst.log &
	tail -f $(log)/makeInst.log

authorities: $(in)/*Auth*
	cd $(adir); rm -f auth.raw
	ln -s $(in)/*Auth* $(adir)/auth.raw
	yaz-marcdump -f marc8 -t utf8 -l 9=97 -o marc $(adir)/auth.raw > $(adir)/auth.mrc
	cd $(inv2); node marc2auth $(conf) $(adir)/auth.mrc > $(log)/makeAuth.log
	cat $(log)/makeAuth.log
	# cd $(wd)/auth; ./marc2auth010.pl $(wd)/mapping_rules/marc_authority_rules.json $(iref) $(adir)/auth.mrc > $(log)/makeAuth.log &
	# tail -f $(log)/makeAuth.log

split-authorities: $(adir)/auth-authorities.jsonl
	cd $(adir); split -l 10000 auth-authorities.jsonl aa
	cd $(adir); split -l 10000 auth-srs.jsonl as

users: $(in)/*Patrons*out
	cd $(udir); rm -r users.raw; ln -s $(in)/*Patrons*out users.raw
	yaz-marcdump -f marc8 -t utf8 -l 9=97 -o marc $(udir)/users.raw > $(udir)/users.mrc
	cd $(wd)/patrons2; node usersDera $(uref) $(udir)/users.mrc > $(log)/makeUsers.log
	cat $(log)/makeUsers.log

checkouts: $(in)/check*xls
	cp $(in)/check*xls $(cdir)/loans.xls
	cd $(wd)/util/; node xlsx2csv.js $(cdir)/loans.xls
	cd $(cdir); mv *Export*.csv loans.csv
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

