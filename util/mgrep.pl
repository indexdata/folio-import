#!/usr/bin/perl
binmode(STDOUT, ":utf8");

my $m = shift or die "Usage: ./mgrep.pl <match> <raw_marc_file> [<limit>]\n";
open IN, "<:encoding(utf-8)", shift or die "Can't find raw Marc file!\n";
my $lim = shift || 1000000;
$/ = "\x1D";
$i = 0;
while (<IN>) {
  last if $i == $lim;
  if (/$m/) {
    print $_;
    $i++;
  }
}
