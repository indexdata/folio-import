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

my $term = {
  id => '517505e7-58cc-456c-8505-1ebf197d5c49',
  name => 'Permanent',
  startDate => '2020-01-01T00:00:00.000Z',
  endDate => '2099-12-31T23:59:59.000Z'
};
my $depts = {};
my $listings = {};
my $courses = {};
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
      $depts->{$_}->{name} = $_;
    }
  }
  $listings->{$rid} = {
    id => uuid(),
    externalId => $rid,
    termId => $term->{id},
    termObject => $term
  };
  $courses->{$rid} = {

  }
}

my $tot = 0;
my $d = { departments => [] } ;
foreach (sort keys $depts) {
  push @{ $d->{departments} }, $depts->{$_};
  $tot++;
}
$d->{totalRecords} = $tot;
my $depts_out = to_json($d, {utf8 => 1, pretty => 1});
print $depts_out;

$tot = 0;
my $clist = { courseListings => [] } ;
foreach (sort keys $listings) {
  push @{ $clist->{courseListings} }, $listings->{$_};
  $tot++;
}
$clist->{totalRecords} = $tot;
my $listings_out = to_json($clist, {utf8 => 1, pretty => 1});
print $listings_out; 

sub uuid {
  my $ug = Data::UUID->new;
  my $uuid = $ug->create();
  my $uustr = lc($ug->to_string($uuid));
  return $uustr;
}