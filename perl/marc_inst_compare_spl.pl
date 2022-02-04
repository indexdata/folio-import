#! /usr/bin/perl

# Take a file of raw marc records and check match on 001 to hrid

use MARC::Record;
use Data::Dumper;
use JSON;

binmode STDOUT, ":utf8";

my $infile = shift;
my $instfile = shift or die "Usage: ./marc_ctrl_fix.pl <raw_marc_file> <instance_jsonl> [ <items_tag> ]\n";
if (! -e $infile) {
  die "Can't find marc file!\n"
}
if (! -e $instfile) {
  die "Can't find jsonl file!\n"
}
my $itag = shift;

my $imap = {};
open INST, $instfile;
print "Loading instance records (this may take awhile)...\n";
while (<INST>) {
  chomp;
  my $rec = decode_json($_);
  my $hrid = $rec->{hrid};
  my $id = $rec->{id};
  $imap->{$hrid} = $id;
}

my $matchfile = $infile;
$matchfile =~ s/(.+)\.\w+$/$1/;
$matchfile = "${matchfile}_matches.mrc";
unlink $matchfile;
open OUT, ">>:utf8", $matchfile or die "Can't open match file for writing!";

my $nomatchfile = $infile;
$nomatchfile =~ s/(.+)\.\w+$/$1/;
$nomatchfile = "${nomatchfile}_nomatch.mrc";
unlink $nomatchfile;
open NOUT, ">>:utf8", $nomatchfile or die "Can't open NO match file for writing!";

my $itemfile = $infile;
$itemfile =~ s/(.+)\.\w+$/$1/;
$itemfile = "${itemfile}_items_all.tsv";
unlink $itemfile;
open ITMS, ">>:utf8", $itemfile or die "Can't open items file for writing!";

$/ = "\x1D";
open RAW, "<:encoding(UTF-8)", $infile;

my $count = 0;
my $m = 0;
my $nm = 0;
while (<RAW>) {
  $count++;
  print "$count\n" if $count % 100 == 0;
  my $raw = $_;
  my $ctrlnum;
  my $ok = eval {
    $marc = MARC::Record->new_from_usmarc($raw);
    $ctrlnum = $marc->field('001')->data();
    1;
  };
  my $inst_id = $imap->{$ctrlnum} || '';
  if ($inst_id) {
    $m++;
    print OUT $raw;
  } else {
    print NOUT $raw;
    $nm++;
  }
  foreach ($marc->field('949')) {
    my $iid = $_->subfield('q');
    my $bc = $_->subfield('b');
    my $mt = $_->subfield('c');
    my $lo = $_->subfield('g');
    my $cn = $_->subfield('e');
    print ITMS "$iid\t$bc\t$lo\t$cn\t$mt\t$inst_id\n" if $iid;
  }
}
print "-----------\n";
print "Total scanned: $count\n";
print "Matches found: $m ($matchfile)\n";
print "No Matches:    $nm ($nomatchfile)\n";