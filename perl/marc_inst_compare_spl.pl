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
$itemfile = "${itemfile}_items_match.tsv";
unlink $itemfile;
open ITMS, ">>:utf8", $itemfile or die "Can't open items file for writing!";

my $locmap = {
  # dt => "4a928175-1456-4cb4-b60e-36386ac0ff9c",
  ou => "9d6bdafd-d70a-470e-a76e-490312665432",
  elec => "6bf60302-5ad5-4002-9755-84c0043ec07c",
  mail => "fcd976a0-5114-4676-a73f-42fbb63335c8",
  ill => "735a60af-f702-4d05-97fa-7d0a242a0983",
  hy => "60902c62-ae49-4668-965e-fe5acd43da23",
  pl => "0d8bcede-ef17-4a3f-93fa-50a37e83b0bf",
  dt => "0d8bcede-ef17-4a3f-93fa-50a37e83b0bf",
  # wc => "b0a69eda-dea6-4d6c-8ee7-321531171dc4",
  # so => "445853d2-d20d-4973-9fa5-54fdfdb9466c",
  sh => "8ee1c82a-828e-40e5-a26d-c3bc88d4a25e",
  it => "8ee1c82a-828e-40e5-a26d-c3bc88d4a25e",
  wc => "8ee1c82a-828e-40e5-a26d-c3bc88d4a25e",
  spsshaw => "16832d9c-6a55-4e08-a002-1d64c6e7d4f8",
  ss => "b35a974a-06ce-49fd-897b-4c970fdd72d3",
  lp => "61e95485-8ea3-4792-a09f-aa7441210109",
  so => "61e95485-8ea3-4792-a09f-aa7441210109",
  es => "61e95485-8ea3-4792-a09f-aa7441210109",
  #it => "9077ba27-83bf-4854-9322-cc0ccf6eaaed",
  spl-bo => "e339f248-2289-4418-bb24-bf38fa837588",
  on => "af52afd9-55ad-4f99-baeb-a8aaef1c236e",
  os => "b6e72323-3ca3-4ab7-abb4-d28aaf57db2a",
  # es => "91c54a1c-4f0a-472d-b2ae-39b1282d926b",
  nt => "a8c1ccfb-d4f5-48cc-aaa9-f607a29288ca",
  spsglov => "4109ce59-4ff8-4c99-8918-8e9aec9d732d"
};

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
  if ($imap->{$ctrlnum}) {
    my $inst_id = $imap->{$ctrlnum};
    $m++;
    print OUT $raw;
    foreach ($marc->field('949')) {
      my $iid = $_->subfield('q');
      my $bc = $_->subfield('b');
      my $mt = $_->subfield('c');
      my $lo = $_->subfield('g');
      my $cn = $_->subfield('e');
      my $loc = ($locmap->{$lo}) ? $locmap->{$lo} : $lo;
      print ITMS "$iid\t$bc\t$loc\t$cn\t$mt\t$inst_id\n" if $iid;
    }
  } else {
    print NOUT $raw;
    $nm++;
  }
}
print "-----------\n";
print "Total scanned: $count\n";
print "Matches found: $m ($matchfile)\n";
print "No Matches:    $nm ($nomatchfile)\n";