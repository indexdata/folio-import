#!/usr/bin/perl

# This script will create course reserves json files from a tsv file.

use JSON;
use Data::Dumper;
use Data::UUID;

binmode(STDOUT, 'utf8');

if (!$ARGV[0]) {
  die "Usage: $0 <loans_tsv_file> [limit]\n";
}
my $limit = $ARGV[1] || 100000;

my $tsv_file = shift;
open TSV, $tsv_file or die "Can't open $tsv_file!";

my $path = $tsv_file;
$path =~ s/^(.+)\/.+/$1/;

my $sp = '3a40852d-49fd-4df2-a1f9-6e2641a6e91f';
my $line = 0;
my $checkout = { checkouts => [] };
while (<TSV>) {
  chomp;
  s/\r//g;
  $line++;
  next if $line == 1;
  my ($bc, $ldate, $due, $au, $ti, $pname, $userbc) = split /\t/;
  my $co = {
    itemBarcode => $bc,
    userBarcode => $userbc,
    servicePointId => $sp,
    loadDate => $ldate
  };
  if ($bc && $userbc) {
    push @{ $checkout->{checkouts} }, $co;
  }
}
my $co_json = to_json($checkout, {utf8 => 1, pretty => 1});
print $co_json;


sub uuid {
  my $ug = Data::UUID->new;
  my $uuid = $ug->create();
  my $uustr = lc($ug->to_string($uuid));
  return $uustr;
}