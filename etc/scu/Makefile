lib=scu
lscript=login-$(lib)-migrate.sh
home=/home/charles
data=$(home)/$(lib)
invdir=$(data)/inv
mfile=$(invdir)/bibs.mrc
log=$(data)/log
wd=$(home)/folio-import
tsvdir=$(wd)/etc/$(lib)
iref=$(data)/ref/inv
aref=$(data)/ref/acq
uref=$(data)/ref/usr
rules=$(wd)/etc/scu/mapping-rules.json
odir=$(data)/orders
udir=$(data)/users
cdir=$(data)/circ
email=oscarmail@scu.edu

instances:
	cd $(invdir); cat marc0*.mrc > bibs.mrc
	./marc2inst-$(lib).pl $(rules) $(iref) $(mfile) > $(log)/make-marc.log 2>$(log)/make-marc-err.log &

checkin-holdings:
	cd $(invdir); cat holdings0*.jsonl > checkins.jsonl
	./holdings-$(lib).pl $(iref) $(invdir)/bibs.map $(invdir)/checkins.jsonl > $(log)/make-holdings.log &

item:
	cd $(invdir); cat items0*.jsonl > items.jsonl
	./items-$(lib).pl $(iref) $(invdir)/bibs.map $(invdir)/items.jsonl > $(log)/make-items.log &

split-inventory: $(invdir)/bibs_instances.jsonl
	cd $(invdir); cat *-holdings.jsonl > all_holdings.jsonl
	split -l 325000 $(invdir)/bibs_instances.jsonl $(invdir)/in
	split -l 3000 $(invdir)/bibs_presuc.jsonl $(invdir)/ps
	split -l 160000 $(invdir)/all_holdings.jsonl $(invdir)/ho
	rm $(invdir)/all_holdings.jsonl
	split -l 240000 $(invdir)/items-items.jsonl $(invdir)/it
	split -l 325000 $(invdir)/bibs_srs.jsonl $(invdir)/sr

order:
	cd $(odir); cat orders0* > all_orders.jsonl
	cd $(wd)/acquisitions; node scuOrders.js $(aref) $(invdir)/bibs_instances.jsonl $(odir)/all_orders.jsonl > $(log)/make-orders.log
	cat $(log)/make-orders.log

user: $(udir)/users00000000.jsonl
	cd $(udir); ln -s users00000000.jsonl users.jsonl
	cd $(wd)/patrons; node scuUsers.js $(uref) $(udir)/users.jsonl $(email) > $(log)/make-users.log &

split-users: $(udir)/users-users.jsonl
	cd $(udir); split -l 6000 users-users.jsonl usru
	cd $(udir); split -l 6000 users-perms-users.jsonl usrp
	cd $(udir); split -l 6000 users-request-prefs.jsonl usrr
	cd $(udir); split -l 10000 users-notes.jsonl usrn

view-log-users: $(log)/make-users.log
	cat $(log)/make-users.log

checkouts: $(cdir)
	rm -f $(cdir)/items.jsonl
	rm -f $(cdir)/users.jsonl
	cd $(cdir); ln -s $(invdir)/items.jsonl items.jsonl
	cd $(cdir); ln -s $(udir)/users-users.jsonl users.jsonl
	cd $(wd)/patrons; node scuCheckouts.js $(iref) $(cdir)/users.jsonl $(cdir)/items.jsonl > $(log)/make-checkouts.log & 
	tail -f $(log)/make-checkouts.log

clean-inventory: $(iinfo)
	cd $(invdir); rm bibs.mrc; mv raw.marc raw.mrc

clean-users: $(udir)/users.jsonl
	rm $(udir)/users.jsonl

setup:
	cd $(wd); git pull	
	mkdir -p $(iref)
	mkdir -p $(aref)
	mkdir -p $(uref)
	mkdir -p $(log)
	mkdir -p $(cdir)
	mkdir -p $(invdir)
	mkdir -p $(odir)
	mkdir -p $(udir)
	mkdir -p $(data)/save
	cp $(tsvdir)/*.tsv $(iref)
	cp $(tsvdir)/locations.tsv $(aref)
	cp $(tsvdir)/ptypes.tsv $(uref)
	cp $(tsvdir)/fund-codes.tsv $(aref)
	cp $(wd)/configs/bash/$(lscript) .
	cp $(wd)/bash/reference_*.sh .
	cp $(wd)/inventory/marc2inst-$(lib).pl .
	cp $(wd)/inventory/holdings-$(lib).pl .
	cp $(wd)/inventory/items-$(lib).pl .
	./$(lscript)
	./reference_inventory.sh $(iref)
	./reference_acq.sh $(aref)
	./reference_finance.sh $(aref)
	./reference_users.sh $(uref)

clean:
	rm -rf $(iref)
	rm -rf $(aref)
	rm -f marc2inst-$(lib).pl
	rm -f holdings-$(lib).pl
	rm -f items-$(lib).pl
	rm -f reference_*.sh
	rm -f $(lscript)
