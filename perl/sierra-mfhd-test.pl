#!/usr/bin/perl

use strict;
use warnings;
use JSON;
use UUID::Tiny ':std';
use Data::Dumper;

my $infile = shift;

die "Usage: ./sierra_mfhd-test.pl <sierra_holdings_file.jsonl>\n" unless $infile;

open IN, "<:encoding(UTF-8)", $infile or die "There was a problem opening $infile!";

my $json = JSON->new;
$json->canonical();

while (<IN>) {
  my $h = $json->decode($_);
  my $vf = $h->{varFields};
  my $field = {};
  foreach my $v (@{ $vf }) {
    my $tag = $v->{marcTag} || '';
    if ($tag && $tag gt '009') {
      my $tag = $v->{marcTag};
      my @sfs;
      foreach my $s (@{ $v->{subfields} }) {
        my $code = $s->{tag};
        my $val = $s->{content};
        push @sfs, "\$$code $val";
      }
      my $sfstring = join ' ', @sfs;
      push @{ $field->{$tag} }, $sfstring;
    } elsif ($v->{fieldTag} eq '_') {
      $field->{LDR} = $v->{content};
    }
  }
  $field->{'001'} = $h->{id};
  $field->{'004'} = $h->{bibIds}->[0];
  print Dumper($field);
}