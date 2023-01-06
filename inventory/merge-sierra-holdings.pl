#! /usr/bin/perl

use strict;
use warnings;

use MARC::Record;
use JSON;
use Data::Dumper;

$| = 1;

binmode STDOUT, ":utf8";

my $mfile = shift;

if (!$mfile) {
  die "Usage: ./merge-sierra-holdings.pl <raw_marc_file> <sierra_holdings_files...> \n";
}

my $outfile = $mfile;
$outfile =~ s/^(.+)\..*/$1-merged.mrc/;
unlink $outfile;

my $json = JSON->new();

my $h = {};
my $lc = 0;
print "Loading Sierra holdings into memory...\n";
foreach (@ARGV) {
  print "Processing $_...\n";
  open HF, $_ or die "Can't open holdings file $_";
  while (<HF>) {
    chomp;
    my $l = $json->decode($_);
    my $bid = $l->{bibIds}[0];
    if ($bid) { 
      $bid = 'b' . $bid;
      push @{ $h->{$bid} }, $_;
      $lc++;
    }
  }
}
close HF;
print "$lc lines processed\n";

open MOUT, ">>:encoding(UTF-8)", $outfile or die "Cant write to $outfile!";

$/ = "\x1D";
open RAW, "<:encoding(UTF-8)", $mfile;
my $hrc = 0;
my $c = 0;
my $src = 0;
while (<RAW>) {
  $c++;
  my $raw = $_;
  if (/^\d{5}..s/) {
    my $marc = MARC::Record->new_from_usmarc($raw);
    my $id = $marc->subfield('907', 'a');
    $id =~ s/^\.(.+)\w/$1/;
    my $hstring = $h->{$id};
    print '.' if $c % 100 == 0;
    foreach (@{ $hstring }) {
      $src++;
      my $shr = $json->decode($_);
      my $hloc = $shr->{fixedFields}->{40}->{value};
      $hloc =~ s/\s+$//;
      my @fields;
      foreach (@{ $shr->{varFields} }) {
        my $mt = $_->{marcTag} || '';
        if ($mt =~ /^8/) {
          my @newsf;
          foreach (@{ $_->{subfields} }) {
            push @newsf, $_->{tag} => $_->{content};
          }
          my $field = MARC::Field->new($mt, $_->{ind2}, $_->{ind2}, '9' => $hloc, @newsf);
          push @fields, $field;
        }
      }
      $marc->insert_fields_ordered(@fields);
      $hrc++
    }
    print MOUT $marc->as_usmarc();
  } else {
    print MOUT $raw;
  }
}
print "\nMarc records read: $c\n";
print "Serials records:   $src\n";
print "Sierra holdings records found: $hrc\n";