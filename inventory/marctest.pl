#!/usr/bin/perl

use MARC::Record;
use Data::Dumper;

binmode STDOUT, ":utf8";

my $mfile = shift or die "Usage: ./marctest.pl <raw_marc_file> <type: record|batch>";

my $type = shift;
if ($type !~ /record|batch/) {
  die "Type must be 'record' or 'batch'!";
}

my $start = time();
my $c = 0;
if ($type eq 'record') {
  $/ = "\x1D";
  open RAW, "<:encoding(UTF-8)", $mfile;
  while (<RAW>) {
    my $marc = eval { MARC::Record->new_from_usmarc($_); };
    $c++;
    if ($c % 10000 == 0) {
      my $now = time();
      my $diff = $now - $start;
      print $c . " in $diff secs\n";
    }
  }
} else {
  use MARC::File::USMARC;
  my $batch = MARC::File::USMARC->in($mfile);
  while ($batch->next()) {
    $c++;
    if ($c % 10000 == 0) {
      my $now = time();
      my $diff = $now - $start;
      print $c . " in $diff secs\n";
    }
  }
}

