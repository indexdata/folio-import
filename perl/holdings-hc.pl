#! /usr/bin/perl

# Create FOLIO holdings records from the Sierra item API objects 
#
# Run the following script to get fresh data
#   reference_inventory.sh
#
# You must first create an okapi session by running login.sh to use the above scripts.
#
# To add metadata, set FOLIO_USER_ID to user UUID (e.g. export FOLIO_USER_ID=b8e68b41-5473-5d0c-85c8-f4c4eb391b59)

use strict;
use warnings;

use JSON;
use UUID::Tiny ':std';
use Time::Piece;
use File::Basename;
use Data::Dumper;

binmode STDOUT, ":utf8";

my $ref_dir = shift;
my $map_file = shift;
if (! $ARGV[0]) {
  die "Usage: ./items-hc.pl <ref_data_dir> <instances_tsv_map_file> <iii_holdings_jsonl_file>\n";
}


my $json = JSON->new;
$json->canonical();

my $start = time();
my @lt = localtime();
my $mdate = sprintf("%04d-%02d-%02dT%02d:%02d:%02d-0500", $lt[5] + 1900, $lt[4] + 1, $lt[3], $lt[2], $lt[1], $lt[0]);

sub uuid {
  my $text = shift;
  my $uuid = create_uuid_as_string(UUID_V5, $text);
  return $uuid;
}

sub getRefData {
  my $refdir = shift;
  my $refobj = {};
  local $/ = '';
  foreach (<$refdir/*.json>) {
    my $prop = $_;
    $prop =~ s/^(.+\/)?(.+?)\.json/$2/;
    open my $refdata, $_ or die "Can't open $_";
    my $jsonstr = <$refdata>;
    my $json = eval { decode_json($jsonstr) };
    if ($@) {
      print "WARN $_ is not valid JSON!\n";
    } else {
      foreach (keys %$json) {
        if ($_ ne 'totalRecords') {
          my $refroot = $_;
          $refobj->{$refroot} = {};
          foreach (@{ $json->{$_} }) {
            my $name;
            if ($refroot =~ /^(instanceTypes|contributorTypes|instanceFormats|locations)$/) {
              $name = $_->{code};
            } else {
              $name = $_->{name};
            }
            if ($refroot eq 'locations') {
              $name =~ s/^.+\///;
            }
            my $id = $_->{id};
            $refobj->{$refroot}->{$name} = $id;
          }
        }
      }
    }
  }
 return $refobj;
}

sub makeMapFromTsv {
  my $refdir = shift;
  my $refdata = shift;
  my $tsvmap = {};
  foreach (<$refdir/*.tsv>) {
    my $prop = $_;
    $prop =~ s/^(.+\/)?(.+?)\.tsv/$2/;
    open my $tsv, $_ or die "Can't open $_";
    my $l = 0;
    while (<$tsv>) {
      $l++;
      next if $l == 1;
      chomp;
      s/\s+$//;
      my @col = split(/\t/);
      my $code = $col[0];
      my $name = $col[2] || '';
      if ($prop eq 'statuses') {
        $tsvmap->{$prop}->{$code} = $name;
      } else {
        if ($prop eq 'locations') {
          $name = $col[1];
          $name =~ s/^.+\///;
        }
        $tsvmap->{$prop}->{$code} = $refdata->{$prop}->{$name};
      }
    }
  }
 return $tsvmap;
}

my $inst_map = {};
print "Opening map file-- this may take a while...\n";
open MAP, $map_file;
my $mi = 0;
while (<MAP>) {
  $mi++;
  print "  $mi map lines read\n" if $mi % 1000000 == 0;
  chomp;
  my @d = split(/\|/, $_, 2);
  $inst_map->{$d[0]} = $d[1];
}
close MAP;

$ref_dir =~ s/\/$//;
my $refdata = getRefData($ref_dir);
my $sierra2folio = makeMapFromTsv($ref_dir, $refdata);

my $relations = {
  '0' => 'Resource',
  '1' => 'Version of resource',
  '2' => 'Related resource',
  '3' => 'No information provided'
};

my $ttl = 0;

foreach (@ARGV) {
  my $infile = $_;
  if (! -e $infile) {
    die "Can't find Sierra holdings file!";
  } 
  my $dir = dirname($map_file);
  my $fn = basename($map_file, '.map');
  my $outfile = "$dir/$fn-iii-holdings.jsonl";
  unlink $outfile;
  open my $OUT, ">>", $outfile;

  my $count = 0;
  my $hcount = 0;
  my $errcount = 0;
  my $start = time();
 
  open IN, $infile;

  my $seen = {};
  while (<IN>) { 
    chomp;
    my $obj = $json->decode($_);
    my $iii_bid = $obj->{bibIds}->[0];
    my $bid = "b$iii_bid";
    my $psv = $inst_map->{$bid} || next;
    my @b = split(/\|/, $psv);

    my $vf = {};
    foreach my $f (@{ $obj->{varFields} }) {
      my $t = $f->{marcTag};
      my $ft = $f->{fieldTag};
      if ($t && $t gt '009') {
        my $subs = {};
        foreach my $sf (@{ $f->{subfields} }) {
          my $c = $sf->{tag};
          $subs->{$c} = $sf->{content};
        }
        push @{ $vf->{$t} }, $subs;
      } elsif ($ft) {
        push @{ $vf->{$ft} }, $f->{content};
      }
    }
    # print Dumper($vf);
    my $ff = $obj->{fixedFields};
    my $h = {};
    my $hid = "c" . $obj->{id};
    next if $seen->{$hid};
    $seen->{$hid} = 1;
    my $loc_code = $ff->{40}->{value} || 'xxxxx';
    $loc_code =~ s/ +$//;
    $h->{id} = uuid($hid);
    $h->{hrid} = $hid;
    $h->{instanceId} = $b[0];
    my $loc_id = $refdata->{locations}->{$loc_code} || $refdata->{locations}->{xxxxx};
    $h->{permanentLocationId} = $loc_id;
    $h->{holdingsTypeId} = $b[3];
    my $cn = $vf->{'090'}->[0]->{a} || '';
    if ($cn) {
      $h->{callNumberTypeId} = '95467209-6d7b-468b-94df-0f5d7ad2747d' # LC
    } else {
      $cn = $b[1];
      $h->{callNumberTypeId} = '6caca63e-5651-4db6-9247-3205156e9699' if $cn; # other
    }
    $h->{callNumber} = $cn if $cn;
    $h->{discoverySuppress} = $obj->{suppressed};
    foreach my $t ('n', 'z') {
      foreach (@{ $vf->{$t} }) {
        push @{ $h->{notes} }, make_notes($t, $_);
      }
    }
    foreach my $t ('863', '864', '865') {
      foreach my $f (@{ $vf->{$t} }) {
        my @data;
        my @notes;
        for my $s ('a' .. 'z') {
          if ($f->{$s}) {
            if ($s =~ /[mnz]/) {
              push @notes, $f->{$s};
            } else {
              push @data, $f->{$s};
            }
          }
        }
        my $text = join ', ', @data;
        my $note = join ', ', @notes;
        my $htype = 'holdingsStatements';
        if ($t eq '864') {
          $htype = 'holdingsStatementsForSupplements';
        } elsif ($t eq '865') {
          $htype = 'holdingsStatementsForIndexes';
        }
        push @{ $h->{$htype} }, make_statment($text, $note);
      }
    }
    
    my $hr = $json->encode($h);
    write_objects($OUT, $hr . "\n");
    $count++;
    $ttl++;
  } 
  close IN;
}
my $end = time;
my $secs = $end - $start;
print "\n$ttl Sierra holdings processed in $secs secs.\n\n";

sub make_statment {
  my $text = shift;
  my $note = shift;
  my $s = {};
  $s->{statement} = $text;
  $s->{note} = $note if $note;
  return $s;
}

sub make_notes {
  my $type = shift;
  my $note = shift;
  my $n = { note=>$note };
  $n->{holdingsNoteTypeId} = '77be02da-ca4e-4339-8c2b-c179a8483023'; #general
  if ($type eq 'z') {
    $n->{staffOnly} = JSON::true;
  } else {
    $n->{staffOnly} = JSON::false;
  }
  return $n;
}

sub write_objects {
  my $fh = shift;
  my $recs = shift || '';
  print $fh $recs;
}

sub dedupe {
  my @out;
  my $found = {};
  foreach (@_) { 
    $found->{$_}++;
    if ($found->{$_} < 2) {
      push @out, $_;
    }
  }
  return [ @out ];
}
