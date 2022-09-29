#!/usr/bin/perl
binmode(STDOUT, ":utf8");

my $m = shift or die "Usage: ./mgrep.pl <match> <raw_marc_file> [<limit>]\n";
my $lim = 10000000;
$/ = "\x1D";
$i = 0;
foreach (@ARGV) {
  open IN, "<:encoding(utf-8)", $_ or die "Can't find raw Marc file!\n";
  while (<IN>) {
    last if $i == $lim;
    if (/$m/) {
      print $_;
      $i++;
    }
  }
}
