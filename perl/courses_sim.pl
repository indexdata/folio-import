#!/usr/bin/perl

# This script will create course reserves json files from a tsv file.

use JSON;
use Data::Dumper;
use Data::UUID;

binmode(STDOUT, 'utf8');

if (!$ARGV[0]) {
  die "Usage: $0 <courses_tsv_file> [limit]\n";
}
my $limit = $ARGV[1] || 100000;

my $tsv_file = shift;
open TSV, "<:encoding(UTF8)", $tsv_file or die "Can't open $tsv_file!";

my $path = $tsv_file;
$path =~ s/^(.+)\/.+/$1/;

my $term = {
  id => '517505e7-58cc-456c-8505-1ebf197d5c49',
  name => 'Permanent',
  startDate => '2020-01-01T00:00:00.000Z',
  endDate => '2099-12-31T23:59:59.000Z'
};
my $depts = {};
my $listings = {};
my $courses = { courses => [] };
my $line = 0;
while (<TSV>) {
  chomp;
  $line++;
  next if $line == 1;
  my @dept;
  my @pid;
  my @profs;
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
  my @names = split(/\^"/, $prof);
  my $p = 0;
  foreach (@pid) {
    next unless $_;
    $names[$p] =~ s/"//g;
    $names[$p] =~ s/\s*\(.+?\).*//;
    if (!$names[$p]) {
      die "Instructor name cannot by empty!"
    };
    my $inst = {
      id => uuid(),
      name => $names[$p],
      barcode => $_,
      courseListingId => $listings->{$rid}->{id}
    };
    push @profs, $inst; 
    $p++;
  }
  $listings->{$rid}->{instructorObjects} = [];
  push @{ $listings->{$rid}->{instructorObjects} }, @profs;
  my @crs = split(/\^"/, $course);
  my $c = 0;
  foreach (@crs) {
    s/"\s*$//;
    my $num;
    $num = $_ if / - /;
    $num =~ s/^(.+?) -.*/$1/;
    my $name = $_;
    my $sect = $prof;
    $sect =~ s/.*?\((.+?)\).*/$1/;
    my $cobj = {
      id => uuid(),
      name => $_,
      courseNumber => $num,
      departmentId => $depts->{$dept[$c]}->{id},
      departmentObject => $depts->{$dept[$c]},
      courseListingId => $listings->{$rid}->{id},
      courseListingObject => $listings->{$rid},
      sectionName => $sect
    };
    push @{ $courses->{courses} }, $cobj;
    $c++;
  }
  last if $line > $limit;
}

my $courses_out = to_json($courses, {utf8 => 1, pretty => 1});
open OUT, ">$path/courses.json";
print OUT $courses_out;
close OUT;

my $tot = 0;
my $d = { departments => [] } ;
foreach (sort keys $depts) {
  push @{ $d->{departments} }, $depts->{$_} if $depts->{$_}->{id};
  $tot++;
}
$d->{totalRecords} = $tot;
my $depts_out = to_json($d, {utf8 => 1, pretty => 1});
open OUT, ">$path/departments.json";
print OUT $depts_out;
close OUT;

$tot = 0;
my $clist = { courseListings => [] } ;
foreach (sort keys $listings) {
  push @{ $clist->{courseListings} }, $listings->{$_};
  $tot++;
}
$clist->{totalRecords} = $tot;
my $listings_out = to_json($clist, {utf8 => 1, pretty => 1});

sub uuid {
  my $ug = Data::UUID->new;
  my $uuid = $ug->create();
  my $uustr = lc($ug->to_string($uuid));
  return $uustr;
}