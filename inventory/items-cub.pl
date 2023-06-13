#! /usr/bin/perl

# Create FOLIO item records from the Sierra item API objects 
#
# Run the following script to get fresh data
#   reference_inventory.sh
#
# You must first create an okapi session by running login.sh to use the above scripts.
#

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
my $id_admin = 'c83f82f7-1ca3-5512-85d6-e3cb76be16eb';

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

my $gcodes = {
  '7777'=>1,
  '7778'=>1,
  '7779'=>1,
  '7780'=>1,
  '7781'=>1,
  '7786'=>1,
  '7799'=>1
};

my $months = {
  '01'=>"January",
  '02'=>"February",
  '03'=>"March",
  '04'=>"April",
  '05'=>"May",
  '06'=>"June",
  '07'=>"July",
  '08'=>"August",
  '09'=>"September",
  '10'=>"October",
  '11'=>"November",
  '12'=>"December"
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
            $name = lc($name);
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
      # next if $l == 1;
      chomp;
      s/\s+$//;
      my @col = split(/\t/);
      my $code = ($col[0] =~ /\w/) ? $col[0] : '';
      $code =~ s/^ +| +$//g;
      my $name = $col[2] || '';
      if ($prop eq 'mtypes') {
        $name = $col[1] || '';
        $name = lc $name;
      }
      $name =~ s/^ +| +$//g;
      if ($prop eq 'statuses') {
        $tsvmap->{$prop}->{$code} = $name;
      } else {
        $name = lc($name);
        if ($prop eq 'locations') {
          $name = $col[1] || '';
          $name =~ s/^.+\///;
          $name = lc $name;
        }
        if ($refdata->{$prop}->{$name}) {
          $tsvmap->{$prop}->{$code} = $refdata->{$prop}->{$name};
        }
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
  my @d = split(/\|/, $_);
  my $mkey = $d[0] . '-' . $d[1] if $d[0] && $d[1];
  push @{ $hold_map->{$mkey} }, $d[2] if $d[2];
}
close MAP;

$ref_dir =~ s/\/$//;
my $refdata = getRefData($ref_dir);
# print Dumper($refdata->{mtypes}); exit;
my $sierra2folio = makeMapFromTsv($ref_dir, $refdata);
# print Dumper($sierra2folio->{mtypes}); exit;
# print Dumper($sierra2folio->{locations}); exit;

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
my $inc = {};
my $bseen = {};
my $hseen = {};

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
  
 
  open IN, $infile;

  while (<IN>) { 
    chomp;
    my $obj = $json->decode($_);
    my $bwc = 0;
    my $main_bib = 'b' . $obj->{bibIds}->[0];
    foreach my $it_bid (@{ $obj->{bibIds} }) {
      my $bid = "b$it_bid";
      if (!$inc->{$bid}) {
        $inc->{$bid} = 0;
      }
      $inc->{$bid}++;
      my $psv = $inst_map->{$bid} || '';
      if (!$psv) {
        print "WARN No map entry found for $bid (item: $obj->{id})\n";
        next;
      }
      my @b = split(/\|/, $psv);
      my $out = make_hi($obj, $b[0], $bid, $b[1], $b[2], $bwc, $b[3]);
      print HOUT $out->{holdings};
      print IOUT $out->{items};
      print BOUT $out->{bws};
      if ($bwc > 0) {
        my $superline = $inst_map->{$main_bib} || '';
        my $subline = $inst_map->{$bid} || '';
        if ($superline && $subline) {
          my @super = split(/\|/, $superline);
          my @sub = split(/\|/, $subline);
          my $robj = { superInstanceId=>$super[0], subInstanceId=>$sub[0], instanceRelationshipTypeId=>'758f13db-ffb4-440e-bb10-8a364aa6cb4a' };
          print ROUT $json->encode($robj) . "\n";
          $rcount++;
        }
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
  my $hinc = sprintf("%03d", $inc->{$bhrid});

  my $loc = $item->{fixedFields}->{79}->{value} || '';
  my $cdate = $item->{fixedFields}->{83}->{value} || '';
  my $udate = $item->{fixedFields}->{84}->{value} || '';
  my $metadata = make_meta($id_admin, $cdate, $udate);
  next if !$loc;
  $loc =~ s/(\s*$)//;
  my $hkey = "$bhrid-$loc";
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
  my $mloc = $loc;
  my $mkey = "$bhrid-$mloc";
  $mloc =~ s/^(...).*/$1/;
  my $fkey = "$bhrid-$mloc";
  my $holdid = '';
  if ($hold_map->{$mkey}) {
    $holdid = $hold_map->{$mkey}[0];
  } elsif ($hold_map->{$fkey}) {
    $holdid = $hold_map->{$fkey}[0];
  }

  # make holdings record from item;
  $hkey = "$hkey-$cn";
  $hid = uuid($hkey);
  if (!$hseen->{$hkey} && !$holdid)  {
    $hcall = $cn || '';
    my $iid = 'i' . $item->{id};
    my $bc = $vf->{b}[0] || '[No barcode]';
    $hrec->{id} = $hid;
    $hrec->{_version} = $ver;
    $hrec->{hrid} = "$bhrid-$hinc";
    $hrec->{instanceId} = $bid;
    $hrec->{permanentLocationId} = $locid;
    $hrec->{sourceId} = $refdata->{holdingsRecordsSources}->{folio} || '';
    my $htype = $htype_map->{$blevel} || '';
    $htype = lc($htype);
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
    $hrec->{metadata} = $metadata;
    my $hout = $json->encode($hrec);
    $holdings .= $hout . "\n";
    $hseen->{$hkey} = 1;
    $hcount++;
  }

  # make item record;
  my $irec = {};
  my $iid = $item->{id};
  my $itype = $item->{fixedFields}->{61}->{value};
  my $status = $item->{fixedFields}->{88}->{value} || '';
  my $icode1 = $item->{fixedFields}->{59}->{value} || '';
  my $bc = '';
  my $ubc = '';
  foreach (@{$vf->{b}}) {
    if ($_) {
      s/ +$//;
      $_ = uc $_;
      if ($_ =~ /^P/) {
        $bc = $_;
      } else {
        $ubc = $_;
      }
    }
  }
  if (!$bc && $ubc) {
    $bc = $ubc;
    $ubc = '';
  }
  my @msgs = $vf->{m};
  my @notes;
  push @notes, "Former location: $loc";
  push @notes, @{ $vf->{x} } if $vf->{x};
  push @notes, @{ $vf->{w} } if $vf->{w};
  $status =~ s/\s+$//;
  if ($iid) {
    $iid =~ s/^\.//;
    $irec->{_version} = $ver;
    $irec->{holdingsRecordId} = $holdid || $hid || die "No holdings record ID found for $iid";
    my @pnotes;
    if ($bwc == 0) {
      $irec->{barcode} = $bc if $bc && !$bseen->{$bc};
      $bseen->{$bc} = 1;
      if ($ubc) {
        $irec->{formerIds} = [ $ubc ];
      }
    } else {
      push @notes, "This item is bound with $bc";
      my $main_id = uuid($iid);
      $bw = {
        itemId => $main_id,
        holdingsRecordId => $irec->{holdingsRecordId},
        id => uuid($main_id . $irec->{holdingsRecordId})
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
    $irec->{permanentLoanTypeId} = $sierra2folio->{loantypes}->{$itype} || $refdata->{loantypes}->{'can circulate'};
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
    foreach (@pnotes) {
      my $nobj = {};
      $nobj->{note} = $_;
      $nobj->{itemNoteTypeId} = '5c9f271c-4960-4356-840e-0a8fc050a420'; # PASCAL Barcode
      $nobj->{staffOnly} = 'true';
      push @{ $irec->{notes} }, $nobj;
    }
    if ($gcodes->{$icode1}) {
      my $y = $cdate;
      $y =~ s/^(\d{4}).+/$1/;
      my $m = $cdate;
      $m =~ s/^\d{4}-(\d\d).+/$1/;
      my $mon = $months->{$m};
      my $nobj = {};
      $nobj->{note} = "Google Batch [$mon $y]";
      $nobj->{itemNoteTypeId} = '7a46e1ca-d2eb-49a3-9935-59bed639e6f1';  # Google Books Project
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
      $irec->{metadata} = $metadata;
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

sub make_meta {
  my $user = shift;
  my $cdate = shift;
  my $udate = shift;
  my $out = {
    createdDate=>$cdate,
    createdByUserId=>$user,
    updatedDate=>$udate,
    updatedByUserId=>$user
  };
  return $out;
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
