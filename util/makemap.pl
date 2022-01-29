#!/usr/bin/perl

# This script takes an instance, holdings or item record collection
# in JSONL format and return an hrid to id map.

use JSON;
use Data::Dumper;

my $infile = shift;

unless ($infile) {
  print "Usage $0 <jsonl_inventory_file>\n";
  exit;
}

open IN, $infile or die "Can't open input file!\n";

my $out = {};
my $count = 0;
while (<IN>) {
  $count++;
  print ("Processed $count records...\n") if $count % 10000 == 0;
  chomp;
  my $jrec = decode_json($_);
  $out->{$jrec->{hrid}} = $jrec->{id};
}
print "---------------\nTotal records: $count\n";
print "Writing to ${infile}-map.json\n";
my $jout = JSON->new->pretty->encode($out);
$infile =~ s/\.\w+$//;
open OUT, ">${infile}-map.json";
print OUT $jout;
