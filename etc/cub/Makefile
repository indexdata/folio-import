data=/data/colorado
marcdir=$(data)/marc
itemdir=$(data)/item
log=$(data)/log
home=/home/charles
sdir=$(home)/sierra-api/js
wd=$(home)/folio-import
iref=$(data)/inv-ref
uref=$(data)/usr-ref
aref=$(data)/acq-ref

get-items: $(itemdir)
	cd $(sdir); node downloadItems.js -s 0 -e 1999 $(itemdir) > $(log)/items0.log & 
	cd $(sdir); node downloadItems.js -s 2000 -e 3999 $(itemdir) > $(log)/items1.log & 
	cd $(sdir); node downloadItems.js -s 4000 $(itemdir) > $(log)/items2.log & 

marc-group: $(marcdir)/*.mrc
	cd $(marcdir); cat marc0[01]*.mrc > part1.mrc
	cd $(marcdir); cat marc0[23]*.mrc > part2.mrc
	cd $(marcdir); cat marc0[45]*.mrc > part3.mrc
	cd $(marcdir); cat marc0[67]*.mrc > part4.mrc
	cd $(marcdir); cat marc0[89]*.mrc > part5.mrc

instances: $(marcdir)/part*mrc
	./run-multi.sh ./marc2inst-cub.pl mapping-rules.json $(iref) $(marcdir)/part?.mrc
setup:
	cd $(wd); git pull	
	cp $(wd)/configs/bash/login-cubl.sh .
	cp $(wd)/bash/reference_* .
	cp $(wd)/perl/marc2inst-cub.pl .
	cp $(wd)/mapping_rules/default.json mapping-rules.json
	mkdir $(iref)
	mkdir $(uref)
	mkdir $(aref)
	./login-cubl.sh
	./reference_inventory.sh $(iref)
	./reference_users.sh $(uref)
	./reference_finance.sh $(aref)
	./reference_acq.sh $(aref)
	./reference_org.sh $(aref)
	cp $(wd)/etc/cub/*.tsv $(iref)
	cp $(wd)/etc/cub/*.* $(aref)

clean:
	rm -rf $(iref)
	rm -rf $(uref)
	rm -rf $(aref)
