#! /usr/bin/perl

# Create FOLIO item records from the Sierra item API objects 
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
  die "Usage: ./items-cub.pl <ref_data_dir> <instances_tsv_map_file> <item_jsonl_file>\n";
}

my $json = JSON->new;
$json->canonical();

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
  my @d = split(/\|/);
  $inst_map->{$d[0]} = {
    id => $d[1],
    cn => $d[2],
    ct => $d[3]
  };
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

foreach (@ARGV) {
  my $infile = $_;
  if (! -e $infile) {
    die "Can't find Sierra items file!";
  } 

  my $count = 0;
  my $hcount = 0;
  my $errcount = 0;
  my $start = time();
 
  open IN, $infile;

  while (<IN>) { 
    chomp;
    print $_ . "\n";
  } 
}
exit;

sub make_hi {
  my $bid = shift;
  my $bhrid = shift;
  my $type = shift;
  my $blevel = shift;
  my $hseen = {};
  my $hid = '';
  # print "Creating holdings for bib# $bhrid\n";
  my $hrec = {};
  my $cn = '';
  my $cntype = '';
  my $holdings = '';
  my $items = '';
  my $hcount = 0;
  my $icount = 0;

  # find and make serials holdings
  if ($blevel eq 's') {
    my $h = { docs=>[] };
    foreach (@{ $h->{docs} }) {
      my $include = 0;
      my $loc = $_->{fixedFields}->{40}->{value};
      $loc =~ s/\s+//;
      my $hrid = "c" . $_->{_id} . "-$loc";
      my $id = uuid($hrid);
      my $sh = {
        id => $id,
        hrid => $hrid,
        permanentLocationId => $sierra2folio->{locations}->{$loc} || '53cf956f-c1df-410b-8bea-27f712cca7c0',
        instanceId => $bid,
        holdingsTypeId => 'e6da6c98-6dd0-41bc-8b4b-cfd4bbd9c3ae', #serial
        sourceId => 'f32d531e-df79-46b3-8932-cdd35f7a2264', #folio
      };
      if ($cn) {
        $sh->{callNumber} = $cn;
        $sh->{callNumberTypeId} = $cntype;
      }
      foreach my $vf (@{ $_->{varFields} }) {
        my $tag = $vf->{marcTag} || '';
        if ($tag =~ /86[678]/) {
          my $obj = {};
          foreach my $sf (@{ $vf->{subfields} }) {
            my $code = $sf->{tag};
            my $val = $sf->{content};
            if ($code eq 'a') {
              $obj->{statement} = $val;
            } elsif ($code eq 'x') {
              $obj->{staffNote} = $val;
            } elsif ($code eq 'z') {
              $obj->{note} = $val;
            }
          }
          if ($obj->{statement}) {
            if ($tag eq '866') {
              push @{ $sh->{holdingsStatements} }, $obj;
            } elsif ($tag eq '867') {
              push @{ $sh->{holdingsStatementsForSupplements} }, $obj;
            } elsif ($tag eq '868') {
              push @{ $sh->{holdingsStatementsForIndexes} }, $obj;
            }
            $include = 1;
          }
        } elsif ($tag eq '856') {
          my $obj = {};
          my $rel = $vf->{ind2};
          foreach my $sf (@{ $vf->{subfields} }) {
            my $code = $sf->{tag};
            my $val = $sf->{content};
            if ($code eq 'z') {
              my $uri = $val;
              my $note = $val;
              $uri =~ s/.*href=(\S+?) ?>.*/$1/;
              $obj->{uri} = $uri;
              $note =~ s/.+?> ?(.+?) ?<.+/$1/;
              $obj->{publicNote} = $note;
              my $rel_str = $relations->{$rel};
              if ($refdata->{electronicAccessRelationships}->{$rel_str}) {
                $obj->{relationshipId} = $refdata->{electronicAccessRelationships}->{$rel_str};
              }
            }
          }
          if ($obj->{uri}) {
            push @{ $sh->{electronicAccess} }, $obj;
            $include = 1;
          }
        }
      }
      # print $json->pretty->encode($sh);
      if ($include) {
        my $hout = $json->encode($sh);
        $holdings .= $hout . "\n";
        $hcount++;
      }
    }
  }
  
  # print Dumper($h);
  my $i = { docs=>[] };
  foreach my $item (@ { $i->{docs} }) {
    my $loc = $item->{fixedFields}->{79}->{value} || '';
    next if !$loc;
    $loc =~ s/(\s*$)//;
    my $hkey = "$bhrid-$loc";
    my $locid = $sierra2folio->{locations}->{$loc} || '53cf956f-c1df-410b-8bea-27f712cca7c0'; # defaults to Norlin Stacks
    my $vf = {};
    foreach (@{ $item->{varFields} }) {
      my $ftag = $_->{fieldTag};
      push @{ $vf->{$ftag} }, $_->{content};
    }
    # make holdings record from item;
    if (!$hseen->{$hkey}) {
      $hid = uuid($hkey);
      $hrec->{id} = $hid;
      $hrec->{hrid} = $hkey;
      $hrec->{instanceId} = $bid;
      $hrec->{permanentLocationId} = $locid;
      $hrec->{holdingsTypeId} = '03c9c400-b9e3-4a07-ac0e-05ab470233ed'; # monograph
      $hrec->{sourceId} = 'f32d531e-df79-46b3-8932-cdd35f7a2264'; # folio
      if ($cn) {
        $hrec->{callNumber} = $cn;
        $hrec->{callNumberTypeId} = $cntype;
      }
      my $hout = $json->encode($hrec);
      $holdings .= $hout . "\n";
      $hseen->{$hkey} = 1;
      $hcount++;
    }

    # make item record;
    my $irec = {};
    my $iid = $item->{_id};
    my $itype = $item->{fixedFields}->{79}->{value};
    my $status = $item->{fixedFields}->{79}->{value} || '';
    my @msgs = $vf->{m};
    my @notes;
    push @notes, @{ $vf->{x} } if $vf->{x};
    push @notes, @{ $vf->{w} } if $vf->{w};
    $status =~ s/\s+$//;
    if ($iid) {
      $iid =~ s/^\.//;
      $irec->{id} = uuid($iid);
      $irec->{holdingsRecordId} = $hid;
      $irec->{hrid} = "i$iid";
      $irec->{barcode} = $vf->{b}[0] || '';
      if ($blevel eq 's') {
        $irec->{enumeration} = $vf->{v}[0] || '';
      } else {
        $irec->{volume} = $vf->{v}[0] || '';
      }
      $irec->{copyNumber} = $item->{fixedFields}->{58}->{value} || '';
      $irec->{permanentLoanTypeId} = $refdata->{loantypes}->{'Can circulate'};
      $irec->{materialTypeId} = $sierra2folio->{mtypes}->{$itype} || '71fbd940-1027-40a6-8a48-49b44d795e46'; # defaulting to unspecified
      $irec->{status}->{name} = $sierra2folio->{statuses}->{$status} || 'Available'; # defaulting to available;
      foreach (@{ $vf->{m} }) {
        if (!$irec->{circulationNotes}) { $irec->{circulationNotes} = [] }
        my $cnobj = {};
        $cnobj->{note} = $_;
        $cnobj->{noteType} = 'Check out';
        $cnobj->{staffOnly} = 'true';
        $cnobj->{date} = "" . localtime;
        $cnobj->{source} = {
          id => 'ba213137-b641-4da7-aee2-9f2296e8bbf7',
          personal => { firstName => 'Index', lastName => 'Data' }
        };
        if (/IN TRANSIT/) {
          $irec->{status}->{name} = 'In transit';
          s/^(.+): ?.+/$1/;
          # $irec->{status}->{date} = $_;
          # my $t = Time::Piece->strptime($_, "%a %b %d %Y %I:%M");
          # $irec->{status}->{date} = $t->strftime("%Y-%m-%d");
        } else {
          push @{ $irec->{circulationNotes} }, $cnobj;
        }
      }
      foreach (@notes) {
        if (!$irec->{notes}) { $irec->{notes} = [] }
        my $nobj = {};
        $nobj->{note} = $_;
        $nobj->{noteTypeId} = '8d0a5eca-25de-4391-81a9-236eeefdd20b';  # Note
        $nobj->{staffOnly} = 'true';
        push @{ $irec->{notes} }, $nobj;
      }
      my $icode2 = $item->{fixedFields}->{60}->{value};
      if ($icode2 eq 'n') {
        $irec->{discoverySuppress} = 'true';
      } else {
        $irec->{discoverySuppress} = 'false';
      }
      my $iout = $json->encode($irec);
      $items .= $iout . "\n";
      $icount++;
    }
  }
  return {
    holdings => $holdings,
    items => $items,
    hcount => $hcount,
    icount => $icount
  };
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
