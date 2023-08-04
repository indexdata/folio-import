home=/Users/charles/Folio
data=$(home)/sul
loans=$(data)/loans
log=$(data)/log
wd=$(home)/folio-import
shared=$(data)/shared

circ: $(cfile)
	cd $(wd)/util; node xlsx2csv.js $(cfile)

checkouts: $(itemdir)/items00000000.jsonl
	cp $(wd)/etc/cub/spoints.tsv $(itemdir)
	cd $(wd)/patrons; node cubCheckouts.js $(iref)/service-points.json $(userdir)/users00000000.jsonl $(itemdir)/items00000000.jsonl > $(log)/make-checkouts.log &
	cd $(wd)/patrons; node cubProspectorCheckouts.js $(userdir)/users00000000.jsonl $(chkdir)/checkouts00000000.jsonl > $(log)/make-pcheckouts.log 

fines: $(finedir)/fines0*.jsonl
	cd $(wd); node authToken.js
	grep '"tenant":"cu"' $(wd)/.okapi
	cd $(wd)/patrons; node cubFines.js $(userdir)/users.map $(finedir)/fines0*jsonl > $(log)/make-fines.log 2>$(log)make-fines.err &

requests: $(reqdir)/holds00000000.jsonl
	cd $(wd)/patrons; node cubRequests.js $(userdir)/users.map $(reqdir)/holds00000000.jsonl Item > $(log)/make-requests.log &

setup:
	# cd $(wd); git pull	
	cp $(wd)/configs/bash/login-stanford.sh .
	cp $(wd)/bash/reference_feefines.sh .
	mkdir -p $(shared)
	mkdir -p $(log)
	./login-stanford.sh
	./reference_feefines.sh $(shared)
	grep stanford $(wd)/config.js
	cd $(wd); node downloadAllByEndpoint service-points $(shared)
	cd $(wd); node downloadAllByEndpoint users $(shared)

clean:
	rm -rf $(shared)
	rm login-stanford.sh
	rm reference_feefines.sh
