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

my $ver = $ENV{_VERSION} || '1';
my $ref_dir = shift;
my $map_file = shift;
my $hmap_file = shift;
if (! $ARGV[0]) {
  die "Usage: ./items-cub.pl <ref_data_dir> <instance_map_file> <holdings_map_file> <item_jsonl_file>\n";
}

my $files = {
  h => 'holdings.jsonl',
  i => 'items.jsonl',
  b => 'bound-withs.jsonl',
  r => 'relationships.jsonl'
};

my $cntypes = {
  '050' => '95467209-6d7b-468b-94df-0f5d7ad2747d',
  '086' => 'fc388041-6cd0-4806-8a74-ebe3b9ab4c6e',
  '090' => '95467209-6d7b-468b-94df-0f5d7ad2747d',
  '092' => '03dd64d0-5626-4ecd-8ece-4531e0069f35',
  '099' => '6caca63e-5651-4db6-9247-3205156e9699',
};

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
print "Opening instance map file-- this may take a while...\n";
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

my $hold_map = {};
print "Opening holdings map file-- this may take a while...\n";
open MAP, $hmap_file;
$mi = 0;
while (<MAP>) {
  $mi++;
  print "  $mi map lines read\n" if $mi % 1000000 == 0;
  chomp;
  my @d = split(/\|/, $_, 2);
  push @{ $hold_map->{$d[0]} }, $d[1];
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

my $htype_map = {
  'm' => 'Monograph',
  's' => 'Serial'
};

my $count = 0;
my $hcount = 0;
my $icount = 0;
my $bcount = 0;
my $rcount = 0;
my $start = time();

foreach (@ARGV) {
  my $infile = $_;
  if (! -e $infile) {
    die "Can't find Sierra items file!";
  } 
  my $dir = dirname($infile);
  my $fn = basename($infile, '.jsonl', '.json');
  my $rawfn = basename($infile);

  my $paths = {};
  for (keys %{ $files }) {
    my $n = $files->{$_};
    my $path = "$dir/$fn-$n";
    $paths->{$_} = $path;
    unlink $path;
  }

  open HOUT, '>>:encoding(UTF-8)', $paths->{h} or die "Can't open $paths->{h} for writing\n";
  open IOUT, '>>:encoding(UTF-8)', $paths->{i} or die "Can't open $paths->{i} for writing\n";
  open BOUT, '>>:encoding(UTF-8)', $paths->{b} or die "Can't open $paths->{b} for writing\n";
  open ROUT, '>>:encoding(UTF-8)', $paths->{r} or die "Can't open $paths->{r} for writing\n";
  
  my $hseen = {};
  my $iseen = {};
 
  open IN, $infile;

  while (<IN>) { 
    chomp;
    my $obj = $json->decode($_);
    my $bwc = 0;
    my $main_bib = 'b' . $obj->{bibIds}->[0];
    foreach my $it_bid (@{ $obj->{bibIds} }) {
      my $bid = "b$it_bid";
      my $psv = $inst_map->{$bid};
      if (!$psv) {
        print "WARN No map entry found for $bid (item: $obj->{id})\n";
        next;
      }
      my @b = split(/\|/, $psv);
      my $out = make_hi($obj, $b[0], $bid, $b[1], $b[2], $hseen, $bwc, $b[3]);
      print HOUT $out->{holdings};
      print IOUT $out->{items};
      print BOUT $out->{bws};
      if ($bwc > 0) {
        my $super = uuid($main_bib);
        my $sub = uuid($bid);
        my $robj = { superInstanceId=>$super, subInstanceId=>$sub, instanceRelationshipTypeId=>'758f13db-ffb4-440e-bb10-8a364aa6cb4a' };
        print ROUT $json->encode($robj) . "\n";
        $rcount++;
      }
      $count++;
      $bwc++;
      $hcount += $out->{hcount};
      $icount += $out->{icount};
      $bcount += $out->{bcount};
      if ($count % 10000 == 0) {
        print "$count items processed [ holdings: $hcount, items: $icount, bound-withs: $bcount, file: $rawfn]\n"
      }
    }
  } 
  close IN;
}
my $end = time() - $start;
print "---------------------------\n";
print "$count items processed in $end secs\n";
print "Holdings:  $hcount\n";
print "Items:     $icount\n";
print "Bounds:    $bcount\n";
print "Relations: $rcount\n";

sub make_hi {
  my $item = shift;
  my $bid = shift;
  my $bhrid = shift;
  my $cn = shift || '';
  my $cntype = shift || '';
  my $hseen = shift;
  my $bwc = shift;
  my $blevel = shift || '';
  my $hid = '';
  my $hrec = {};
  my $holdings = '';
  my $items = '';
  my $hcount = 0;
  my $icount = 0;
  my $bcount = 0;
  my $hcall = '';
  my $bw;
  my $bws = '';

  my $loc = $item->{fixedFields}->{79}->{value} || '';
  next if !$loc;
  $loc =~ s/(\s*$)//;
  my $hkey = "$bhrid-$loc";
  $hid = uuid($hkey);
  my $locid = $sierra2folio->{locations}->{$loc} || '761db5ed-d29d-4e2e-83d1-c6dfd1426cfd'; # defaults to Unmapped location.
  my $vf = {};
  my $local_callno = 0;
  foreach (@{ $item->{varFields} }) {
    my $ftag = $_->{fieldTag};
    push @{ $vf->{$ftag} }, $_->{content};
    if ($ftag eq 'c') {
      my @cntext;
      my $mtag = $_->{marcTag} || 'XXX';
      if ($_->{content}) {
        $cntext[0] = $_->{content};
      } else {
        foreach(@{ $_->{subfields} }) {
          if ($_->{tag} eq 'a') {
            $cntext[0] = $_->{content};
          } elsif ($_->{tag} eq 'b') {
            $cntext[1] = $_->{content};
          }  
        }
      }
      my $cnstring = join ' ', @cntext;
      if ($cnstring) {
        $cn = $cnstring;
        $cntype = $cntypes->{$mtag} || $refdata->{callNumberTypes}->{'Other scheme'};
        $local_callno = 1;
      }
    }
  }
  my $hfound = 0;
  foreach (@{ $hold_map->{$bhrid} }) {
    my @m = split(/\|/);
    if ($loc =~ /$m[0]/) {
      $hid = $m[1];
      $hfound = 1;
      last;
    }
  }

  # make holdings record from item;
  if (!$hseen->{$hkey} && !$hfound)  {
    $hcall = $cn || '';
    my $iid = 'i' . $item->{id};
    my $bc = $vf->{b}[0] || '[No barcode]';
    $hrec->{id} = $hid;
    $hrec->{_version} = $ver;
    $hrec->{hrid} = $hkey;
    $hrec->{instanceId} = $bid;
    $hrec->{permanentLocationId} = $locid;
    $hrec->{sourceId} = $refdata->{holdingsRecordsSources}->{FOLIO} || '';
    my $htype = $htype_map->{$blevel} || '';
    $hrec->{holdingsTypeId} = $refdata->{holdingsTypes}->{$htype} || 'dc35d0ae-e877-488b-8e97-6e41444e6d0a'; #monograph
    if ($cn) {
      $hrec->{callNumber} = $cn;
      $hrec->{callNumberTypeId} = $cntype;
    }
    if ($bwc > 0) {
      my $hnote = {
        note => "Bound with $bc ($iid)",
        holdingsNoteTypeId => $refdata->{holdingsNoteTypes}->{note} || 'b160f13a-ddba-4053-b9c4-60ec5ea45d56',
        staffOnly => 'true'
      };
      push @{ $hrec->{notes} }, $hnote;
    }
    my $hout = $json->encode($hrec);
    $holdings .= $hout . "\n";
    $hseen->{$hkey} = 1;
    $hcount++;
  }

  # make item record;
  my $irec = {};
  my $iid = $item->{id};
  my $itype = $item->{fixedFields}->{79}->{value};
  my $status = $item->{fixedFields}->{88}->{value} || '';
  my $bc = $vf->{b}[0] || '';
  my @msgs = $vf->{m};
  my @notes;
  push @notes, "Former location: $loc";
  push @notes, @{ $vf->{x} } if $vf->{x};
  push @notes, @{ $vf->{w} } if $vf->{w};
  $status =~ s/\s+$//;
  if ($iid) {
    $iid =~ s/^\.//;
    $irec->{_version} = $ver;
    $irec->{holdingsRecordId} = $hid || die "No holdings record ID found for $iid";
    if ($bwc == 0) {
      $irec->{barcode} = $bc if $bc;
    } else {
      push @notes, "This item is bound with $bc";
      my $main_id = uuid($iid);
      $bw = {
        itemId => $main_id,
        holdingsRecordId => $hid,
        id => uuid($main_id . $hid)
      };
      $bws .= $json->encode($bw) . "\n";
      $bcount++;
      $iid = "$iid-$bwc";
    }
    $irec->{hrid} = "i$iid";
    $irec->{id} = uuid($iid);
    if ($blevel eq 's') {
      $irec->{enumeration} = $vf->{v}[0] || '';
    } else {
      $irec->{volume} = $vf->{v}[0] || '';
    }
    $irec->{copyNumber} = $item->{fixedFields}->{58}->{value} || '';
    $irec->{permanentLoanTypeId} = $refdata->{loantypes}->{'Can circulate'};
    $irec->{materialTypeId} = $sierra2folio->{mtypes}->{$itype} || '71fbd940-1027-40a6-8a48-49b44d795e46'; # defaulting to unspecified
    $irec->{status}->{name} = $sierra2folio->{statuses}->{$status} || 'Available'; # defaulting to available;
    foreach my $note (@{ $vf->{m} }) {
      my @ntypes = ('Check out', 'Check in');
      foreach my $ntype (@ntypes) {
        my $cnobj = {};
        $cnobj->{note} = $note;
        $cnobj->{noteType} = $ntype;
        $cnobj->{staffOnly} = 'true';
        $cnobj->{date} = "" . localtime;
        push @{ $irec->{circulationNotes} }, $cnobj;
      }
    }
    foreach (@notes) {
      my $nobj = {};
      $nobj->{note} = $_;
      $nobj->{itemNoteTypeId} = '8d0a5eca-25de-4391-81a9-236eeefdd20b';  # Note
      $nobj->{staffOnly} = 'true';
      push @{ $irec->{notes} }, $nobj;
    }
    my $icode2 = $item->{fixedFields}->{60}->{value};
    if ($icode2 eq 'n') {
      $irec->{discoverySuppress} = 'true';
    } else {
      $irec->{discoverySuppress} = 'false';
    }
    if ($local_callno && $hcall ne $cn) {
      $irec->{itemLevelCallNumber} = $cn;
      $irec->{itemLevelCallNumberTypeId} = $cntype;
    }
    if ($bwc == 0) {
      my $iout = $json->encode($irec);
      $items .= $iout . "\n";
      $icount++;
    }
  }
  return {
    holdings => $holdings,
    items => $items,
    bws => $bws,
    hcount => $hcount,
    icount => $icount,
    bcount => $bcount
  };
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