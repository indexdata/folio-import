#!/usr/bin/perl

# This script will create loans json files from a tsv file.
# A users file is required to determine if a user exists and is active.

use JSON;
use Data::UUID;
use DateTime;
use Data::Dumper;

binmode(STDOUT, 'utf8');

if (!$ARGV[1]) {
  die "Usage: $0 <users.json> <loans_tsv_file> [limit]\n";
}
my $limit = $ARGV[2] || 100000;

my $user_file = shift;
$/ = '';
open USRS, $user_file or die "Can't open $user_file!";
my $users = decode_json(<USRS>);
$/ = "\n";
my $active = {};
my $exists = {};
my $expiry = {};
foreach (@{ $users->{users} }) {
  my $bc = $_->{barcode};
  $exists->{$bc} = 1;
  $expiry->{$bc} = $_->{expirationDate};
  if ($_->{active}) {
    $active->{$bc} = 1;
  } else {
    $active->{$bc} = 0;
  }
}
$users = {};

my $tsv_file = shift;
open TSV, $tsv_file or die "Can't open $tsv_file!";

my $path = $tsv_file;
$path =~ s/^(.+)\/.+/$1/;

my $sp = '3a40852d-49fd-4df2-a1f9-6e2641a6e91f';

my $line = 0;
my $coc = 0;
my $checkout = { checkouts => [] };
my $inactive = { checkouts => [] };
my $nouser = { checkouts => [] };
while (<TSV>) {
  chomp;
  s/\r//g;
  $line++;
  next if $line == 1;
  my ($bc, $ldate, $due, $au, $ti, $call, $pname, $userbc) = split /\t/;
  if ($ldate !~ /\d:\d/) {
    $ldate = "$ldate 12:00:00";
  } else {
    $ldate = "$ldate:00"
  }
  my $iso_ldate = date_conv($ldate);
  my $iso_due = date_conv("$due 23:59:59");
  if ($bc && $userbc) {
    my $co = {
      itemBarcode => $bc,
      userBarcode => $userbc,
      servicePointId => $sp,
      loanDate => $iso_ldate,
      dueDate => $iso_due,
      expirationDate => $expiry->{$userbc}
    };
    if ($exists->{$userbc}) {
      push @{ $checkout->{checkouts} }, $co;
      if (!$active->{$userbc}) {
        push @{ $inactive->{checkouts} }, $co unless $active{$userbc};
      }
    } else {
      push @{ $nouser->{checkouts} }, $co
    }
    
    $coc++;
  } else {
    print "WARN [$line] There is a missing item or user barcode: item: $bc, user: $userbc\n"
  }
  last if $line > $limit;
}

write_json($checkout, 'checkouts.json');
write_json($inactive, 'checkouts-inactive.json');
write_json($nouser, 'checkouts-nouser.json');

sub write_json {
  my $in_obj = $_[0];
  my $fn = $_[1];
  my $count = @{ $in_obj->{checkouts} };
  my $co_json = to_json($in_obj, {utf8 => 1, pretty => 1});
  my $co_out = "$path/$fn";
  print "Writing $count checkout records to $co_out\n";
  open OUT, ">$co_out" or die "Can't write to $co_out\n!";
  print OUT $co_json;
  close OUT;
}

sub date_conv {
  $in = shift;
  my ($m, $d, $y, $h, $min, $sec) = $in =~ /^(\d+)\/(\d+)\/(\d+) (\d+):(\d+):(\d+)/;
  my $dt = DateTime->new(
    year => $y,
    month => $m,
    day => $d,
    hour => $h,
    minute => $min,
    second => $sec,
    time_zone => 'America/New_York'
  );
  my $iso = $dt->iso8601();
  my $offset = '-0500';
  $offset = '-0400' if $dt->is_dst();
  $out = "$iso.000$offset";
  return $out;
}

sub uuid {
  my $ug = Data::UUID->new;
  my $uuid = $ug->create();
  my $uustr = lc($ug->to_string($uuid));
  return $uustr;
}
