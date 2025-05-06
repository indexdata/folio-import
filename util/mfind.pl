#!/usr/bin/perl

# This little script will search a Marc tag and definied subfields for a string or regexp.
# There is a single option, -b which output the found records in binary or else in formatted text.
# All matching records are be sent to STDOUT

use MARC::Record;
use Data::Dumper;

binmode(STDOUT, ":utf8");

my $bin = 0;
my $a = 0;
my $rev = 0;
foreach (@ARGV) {
  if ($_ eq '-b') {
    $bin = 1;
    splice(@ARGV, $a, 1);
  }
  if ($_ eq '-v') {
    $rev = 1;
    splice(@ARGV, $a, 1);
  }
  $a++;
}
$| = 1 if $bin;

my $field = shift;
my $query = shift;
my $mrc = shift or die "Usage: ./mfind.pl [-b -v] <tag[subfield[[occurrence]]]> <regexp> <raw_marc_file> [<limit>]\n";
open IN, "<:encoding(utf-8)", $mrc or die "Can't find raw Marc file!\n";
my $lim = shift || 1000000;
$/ = "\x1D";
$i = 0;
my $occ = -1;
my $toc = -1;
if ($field =~ s/^(...)\[(.+?)\]/$1/) {
  $toc = $2;
}
if ($field =~ s/^(....*)\[(.+?)\]$/$1/) {
  $occ = $2;
}
my ($tag, $sf) = $field =~ /^(...)(.*)/;
# print "$tag $sf\n"; exit;
while (<IN>) {
  last if $i == $lim;
  my $found = 0;
  my $mdata;
  $raw = $_;
  next unless /$query/i;
  my $marc = eval { MARC::Record->new_from_usmarc($raw) };
  if ($marc) {
    if ($field eq 'LDR') {
      $mdata = $marc->leader();
      $found = 1 if $mdata =~ /$query/i;
    } else {
      my $tc = 0;
      foreach ($marc->field($tag)) {
        if ($toc > -1 && $tc != $toc) {
          $tc++;
          next;
        }
        if ($sf) {
          if ($occ > -1) {
            my @subs = $_->subfield($sf);
            $mdata = $subs[$occ];
          } else {
            $mdata = $_->as_string($sf);
          }
        } else {
          $mdata = $_->as_string();
        }
        if ($mdata =~ /$query/) {
          $found = 1;
          last;
        }
      }
    }
  }
  
  if ($found) {
    if ($bin) {
      print $raw;
    } else {
      my $f = $marc->as_formatted();
      $f =~ s/_(\w)/\$$1 /g;
      $f =~ s/\n\s+/ /g;
      print "$f\n\n";
    }
    $i++;
  }
}
print "------\n$i Record(s) Found\n" unless $bin;
