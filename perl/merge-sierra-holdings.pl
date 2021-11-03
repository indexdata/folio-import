#! /usr/bin/perl

use strict;
use warnings;

use MARC::Record;
use JSON;
use Data::Dumper;

binmode STDOUT, ":utf8";

my $mfile = shift;

if (!$mfile) {
  die "Usage: ./merge-sierra-holdings.pl <raw_marc_file> <sierra_holdings_files...> \n";
}

my $json = JSON->new();

my $h = {};
my $lc = 0;
foreach (@ARGV) {
  print "Processing $_...\n";
  open HF, $_ or die "Can't open holdings file $_";
  while (<HF>) {
    chomp;
    my $l = $json->decode($_);
    my $bid = $l->{bibIds}[0];
    if ($bid) { 
      $bid = 'b' . $bid;
      push @{ $h->{$bid} }, $_;
      $lc++;
    }
  }
}
print "$lc lines processed\n";