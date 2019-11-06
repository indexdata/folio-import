#!/usr/bin/perl

# This script will take a line delimited instance record collection (as returned
# by Theodore's Python script) and save a mapping of hrids to instance IDs.

use JSON;
use Data::Dumper;

my $infile = shift;

unless ($infile) {
  print "Usage $0 <line_delimited_instance_file>\n";
  exit;
}

open IN, $infile or die "Can't open input file!\n";

my $out = {};
while (<IN>) {
  chomp;
  my $jrec = decode_json($_);
  $out->{$jrec->{hrid}} = $jrec->{id};
}
my $jout = JSON->new->pretty->encode($out);
$infile =~ s/\.\w+$//;
open OUT, ">${infile}.map";
print OUT $jout;
