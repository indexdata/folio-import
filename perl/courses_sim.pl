#!/usr/bin/perl

# This script will create course reserves json files from a tsv file.

use JSON;
use Data::Dumper;
use Data::UUID;

binmode(STDOUT, 'utf8');

if (!$ARGV[0]) {
  die "Usage: $0 <courses_tsv_file>\n";
}

my $tsv_file = shift;
open TSV, "<:encoding(UTF8)", $tsv_file or die "Can't open $tsv_file!";

my $depts = {};
my $line = 0;
while (<TSV>) {
  chomp;
  $line++;
  next if $line == 1;
  my @dept;
  my @pid;
  (my $rid, my $course, @dept[0..2], my $prof, @pid[0..2], my $items) = split /\t/;
  foreach (@dept) {
    next unless $_;
    if (!$depts->{$_}) {
      $depts->{$_}->{id} = uuid();
    }
  }
}
print Dumper($depts);

sub uuid {
  my $ug = Data::UUID->new;
  my $uuid = $ug->create();
  my $uustr = lc($ug->to_string($uuid));
  return $uustr;
}