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

my $months = {
  '01' => 'Jan.',
  '02' => 'Feb.',
  '03' => 'Mar.',
  '04' => "Apr.",
  '05' => 'May',
  '06' => 'Jun.',
  '07' => 'Jul.',
  '08' => 'Aug.',
  '09' => 'Sep.',
  '10' => 'Oct.',
  '11' => 'Nov.',
  '12' => 'Dec.',
  '21' => 'Spring',
  '22' => 'Summer',
  '23' => 'Autumn',
  '24' => 'Winter'
};

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
        my @parts;
        foreach (0, 1) {
          my $el = $_;
          my @enumparts;
          my @cronparts;
          foreach (@codes) {
            if (/[a-h]/) {
              push @enumparts, $pat->{$_} . $splits->{$_}[$el];
            } else {
              my $p = $pat->{$_};
              my $v = $splits->{$_}[$el];
              if ($p =~ /year/) {
                push @cronparts, $v;
              } elsif ($p =~ /month|season/) {
                my $m = $months->{$v} || $v;
                unshift @cronparts, $m;
              }
            }
          }
          my $enumpart = join ':', @enumparts;
          my $cronpart = join ' ', @cronparts;
          push @parts, "$enumpart ($cronpart)";
        }
        my $statement = join ' - ', @parts;
        print "$statement\n";
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