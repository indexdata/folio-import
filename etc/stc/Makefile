lib=stc
user := $(shell whoami)
home=/home/$(user)
wd=$(home)/folio-import
inv2=$(wd)/inventory2
login=$(wd)/configs/json/stc-test.json
data=$(home)/$(lib)
ref=$(data)/ref
iref=$(ref)/inv
uref=$(ref)/usr
idir=$(data)/inv
udir=$(data)/usr
adir=$(data)/auth
fdir=$(data)/fines
cdir=$(data)/circ
rdir=$(data)/courses
in=$(data)/incoming
mfile=$(idir)/bibs.mrc
log=$(data)/log
tsvdir=$(wd)/etc/$(lib)

instances: $(in)/*.mrc
	cd $(idir); ln -s $(in)/*.mrc raw.marc
	cd $(idir); ln -s $(in)/*Instance-Level* inst-level.txt
	@echo Converting $(mfile) to utf8...
	yaz-marcdump -f marc8 -t utf8 -l 9=97 -o marc $(idir)/raw.marc > $(mfile)
	yaz-marcdump $(mfile) | grep -P '^\d{5}' -c > $(idir)/count.bibs
	cat $(idir)/count.bibs
	cd $(inv2); node marc2inst-stc conf/stc.json $(idir)/inst-level.txt $(mfile) > $(log)/makeInst.log &
	tail -f $(log)/makeInst.log

items: $(in)/Inv*Standard*txt
	cd $(idir); ln -s $(in)/Inv*Standard*txt items.txt
	cd $(idir); ln -s $(in)/Inv*Custom*txt custom.txt
	cd $(idir); ln -s $(in)/Inv*Owners*txt owners.txt
	cd $(inv2); node holdingsItems-stc conf/stc.json $(idir)/bibs.map $(idir)/custom.txt $(idir)/items.txt $(idir)/owners.txt > $(log)/makeHoldingsItems.log
	cat $(log)/makeHoldingsItems.log

clean-inventory:
	cd $(idir); rm *.marc *.mrc *.txt count*

authorities: $(in)/Auth*xml
	cd $(adir); ln -s $(in)/Auth*xml auth.xml
	cd $(inv2); node xml2marc-stc $(adir)/auth.xml
	cd $(wd)/auth; ./marc2auth010.pl $(wd)/mapping_rules/marc_authority_rules.json $(iref) $(adir)/auth.mrc > $(log)/makeAuth.log &
	tail -f $(log)/makeAuth.log

clean-authorities: $(adir)/auth.xml
	cd $(adir); rm *.xml

users: $(udir)
	cd $(udir); ln -s $(in)/*Address* addresses.txt
	cd $(udir); ln -s $(in)/U*Notes* notes.txt
	cd $(udir); ln -s $(in)/U*Standard* users.txt
	cd $(udir); grep -vc USERNAME users.txt > count.txt; cat count.txt
	cd $(wd)/patrons; node stcUsers.js $(uref) $(udir)/addresses.txt $(udir)/notes.txt $(udir)/users.txt > $(log)/makeUsers.log
	cat $(log)/makeUsers.log

clean-users: $(udir)/*.txt
	rm $(udir)/*.txt

checkouts: $(in)/Loans*
	cd $(cdir); ln -s $(in)/Loans* loans.txt
	cd $(wd); [ -f $(cdir)/users.jsonl ] || node downloadJSONL users $(cdir)/users.jsonl
	cd $(wd); [ -f $(cdir)/items.jsonl ] || node downloadJSONL item-storage/items $(cdir)/items.jsonl
	cd $(wd)/patrons; node stcCheckouts $(cdir)/loans.txt > $(log)/makeCheckouts.log
	cat $(log)/makeCheckouts.log

clean-checkouts: $(cdir)/*.txt
	cd $(cdir); rm *.txt

feefines: $(in)/Fee*
	cd $(fdir); cat $(in)/Fee* > fines.txt
	cd $(fdir); grep -vc BILL_REASON fines.txt > count.txt; cat count.txt
	cd $(wd); node downloadJSONL.js actual-cost-record-storage/actual-cost-records?query=status=Open $(fdir)/actual-costs.jsonl
	cd $(wd); [ -f $(fdir)/users.jsonl ] || node downloadJSONL users $(fdir)/users.jsonl
	cd $(wd); [ -f $(fdir)/items.jsonl ] || node downloadJSONL item-storage/items $(fdir)/items.jsonl
	cd $(wd)/patrons; node stcFines.js $(fdir)/fines.txt > $(log)/makeFines.log
	cat $(log)/makeFines.log

clean-feefines: $(fdir)/*.txt
	cd $(fdir); rm *.txt; rm actual-costs.jsonl; rm items.jsonl

course-reserves: $(in)/Course*
	cp $(in)/Courses* $(rdir)/courses.txt
	cp $(in)/*Instructors* $(rdir)/instructors.txt
	cp $(in)/*Items* $(rdir)/reserves.txt
	cd $(wd); [ -f $(rdir)/users.jsonl ] || node downloadJSONL users $(rdir)/users.jsonl
	cd $(wd); [ -f $(rdir)/items.jsonl ] || node downloadJSONL item-storage/items $(rdir)/items.jsonl
	cd $(wd)/courses; node stcCourses $(ref)/crs $(rdir)/instructors.txt $(rdir)/courses.txt $(rdir)/reserves.txt > $(log)/makeCourses.log
	cat $(log)/makeCourses.log

setup:
	cp $(login) $(wd)/config.json
	# sed -e 's#"logpath":.*#"logpath": "$(log)",#' $(wd)/config.json > tmp
	jq '. | .logpath="$(log)"' $(wd)/config.json > tmp
	mv tmp $(wd)/config.json
	mkdir -p $(ref)
	mkdir -p $(log)
	mkdir -p $(idir)
	mkdir -p $(udir)
	mkdir -p $(fdir)
	mkdir -p $(adir)
	mkdir -p $(cdir)
	mkdir -p $(rdir)
	mkdir -p $(in)
	cd $(wd); node migrationRef.js $(ref)
	cp $(tsvdir)/locations.tsv $(iref)
	cp $(tsvdir)/mtypes.tsv $(iref)
	cp $(tsvdir)/groups.tsv $(uref)
	cp $(iref)/service-points.json $(cdir)
clean:
	rm -rf $(ref)

really-clean:
	rm -rf $(ref)
	rm -rf $(log)
	rm -rf $(idir)
	rm -rf $(udir)
	rm -rf $(fdir)
	rm -rf $(adir)
	rm -rf $(cdir)
	rm -rf $(rdir)
	rm -rf $(in)

