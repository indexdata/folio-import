#!/usr/bin/perl

use strict;
use warnings;
use JSON;
use UUID::Tiny ':std';
use Data::Dumper;

my $refdir = shift;
my $infile = shift;

die "Usage: ./sierra_holdings.pl <ref_dir> <sierra_holdings_file.jsonl>\n" unless $infile;

open IN, "<:encoding(UTF-8)", $infile or die "There was a problem opening $infile!";

$refdir =~ s/\/$//;

my $json = JSON->new;
$json->canonical();

sub mapLocs {
  my $file = shift;
  local $/ = '';
  open LF, $file or die "Can't open locations file at $file";
  my $lf = <LF>;
  my $l = $json->decode($lf);
  my $lmap = {};
  foreach (@{ $l->{locations} }) {
    my $k = $_->{code};
    my $v = $_->{id};
    $lmap->{$k} = $v;
  }
  local $/ = "\n";
  return $lmap;
}

my $locmap = mapLocs("$refdir/locations.json");
my $tsvfile = "$refdir/locations.tsv";
open TSV, $tsvfile or die "Can't open tsv file at $tsvfile!";
my $slocmap = {};
while (<TSV>) {
  my @c = split(/\t/);
  $c[1] =~ s/^.+\///;
  $slocmap->{$c[0]} = $locmap->{$c[1]};
}

while (<IN>) {
  my $sh = $json->decode($_);
  # print Dumper($sh);
  my $out = {};
  $out->{id} = create_uuid_as_string(UUID_V5, $sh->{id});
  my $bid = 'b' . $sh->{bibIds}[0];
  $out->{instanceId} = create_uuid_as_string(UUID_V5, $bid);
  my $loc = $sh->{fixedFields}->{40}->{value};
  $loc =~ s/\s+$//;
  $out->{permanentLocationId} = $slocmap->{$loc} || $locmap->{UNMAPPED};
  $out->{hrid} = $sh->{id};
  my $jsonl = $json->pretty->encode($out);
  print $jsonl;
}