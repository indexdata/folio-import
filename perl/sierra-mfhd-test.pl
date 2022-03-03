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
  my $field = parse($h);
  foreach (863) {
    my $etag = $_;
    my $ptag = $etag - 10;
    foreach (keys %{ $field->{$etag} }) {
      my $link = $_;
      my $pat = $field->{$ptag}->{$link}[0];
      # print Dumper($pat);
      my @txt;
      foreach (@{ $field->{$etag}->{$link} }) {
        my $enum = $_;
        # print Dumper($_);
        my $splits = {};
        my @codes;
        foreach (sort keys %{ $enum }) {
          my $c = $_;
          if ($c =~ /^[a-m]$/ && $enum->{$c}) {
            push @codes, $c;
            @{ $splits->{$c} } = split(/-/, $enum->{$c});
          }
        }
        my @ranges;
        foreach (0, 1) {
          my $el = $_;
          my @st;
          foreach (@codes) {
            push @st, $pat->{$_} . $splits->{$_}[$el] if /[a-h]/;
          }
          my $line = join ':', @st;
          print $line . "\n";
        }
      }
    }
  }
}

sub parse {
  my $h = shift;
  my $vf = $h->{varFields};
  my $field = {};
  foreach my $v (@{ $vf }) {
    my $tag = $v->{marcTag} || '';
    if ($tag && $tag gt '009') {
      my $sub = {};
      my @ord;
      my @txt;
      my $num;
      foreach my $s (@{ $v->{subfields} }) {
        my $code = $s->{tag};
        my $val = $s->{content};
        if ($code eq '8') {
          $num = $val;
          $num =~ s/\..+//;
        }
        $sub->{$code} = $val;
        push @ord, $code, $val;
      }
      $sub->{ind1} = $v->{ind1};
      $sub->{ind2} = $v->{ind2};
      push @{ $sub->{arr} }, @ord;
      if ($num) {
        push @{ $field->{$tag}->{$num} }, $sub;
      } else {
        push @{ $field->{$tag} }, $sub;
      } 
    } elsif ($v->{fieldTag} eq '_') {
      $field->{leader} = $v->{content};
    }
  }
  return $field;
}