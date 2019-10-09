#! /usr/bin/perl

use MARC::Record;
use Data::Dumper;
use JSON;
use Data::UUID;

binmode STDOUT, ":utf8";

my $infile = shift or die "Usage: marc2folio_hard.pl <raw_marc_file>\n";
if (! -e $infile) {
  die "Can't find input file!\n"
}

$/ = "\x1D";
open RAW, "<:encoding(UTF-8)", $infile;
while (<RAW>) {
  $raw = $_;
  $instance = [];
  my $marc = MARC::Record->new_from_usmarc($raw);
  my $ug = Data::UUID->new;
  my $uuid = $ug->create();
  my $uustr = lc($ug->to_string($uuid));
  my $field = MARC::Field->new('999','f','f','i' => $uustr);
  $marc->append_fields($field);
  print $marc->as_usmarc;
}