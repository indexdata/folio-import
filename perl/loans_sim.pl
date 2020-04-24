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
my $coc = 0;
my $checkout = { checkouts => [] };
while (<TSV>) {
  chomp;
  s/\r//g;
  $line++;
  next if $line == 1;
  my ($bc, $ldate, $due, $au, $ti, $pname, $userbc) = split /\t/;
  my $iso_ldate = date_conv($ldate);
  if ($bc && $userbc) {
    my $co = {
      itemBarcode => $bc,
      userBarcode => $userbc,
      servicePointId => $sp,
      loadDate => $iso_ldate
    };
    if ($bc && $userbc) {
      push @{ $checkout->{checkouts} }, $co;
    }
    $coc++;
  } else {
    print "WARN [$line] There is a missing item or user barcode: item: $bc, user: $userbc\n"
  }
  last if $line > $limit;
}
my $co_json = to_json($checkout, {utf8 => 1, pretty => 1});
my $co_out = "$path/checkouts.json";
print "Writing $coc checkout records to $co_out\n";
open OUT, ">$co_out" or die "Can't write to $co_out\n!";
print OUT $co_json;

sub date_conv {
  $in = shift;
  my ($m, $d, $y, $h, $min) = $in =~ /^(\d+)\/(\d+)\/(\d+) (\d+):(\d)/;
  my $out = sprintf('%04d-%02d-%02dT%02d:%02d:00.000', $y, $m, $d, $h, $min);
  return $out;
}

sub uuid {
  my $ug = Data::UUID->new;
  my $uuid = $ug->create();
  my $uustr = lc($ug->to_string($uuid));
  return $uustr;
}