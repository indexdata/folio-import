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

my $isil = 'CStclU';
my $ver = $ENV{_VERSION} || '1';
my $ref_dir = shift;
my $map_file = shift;
my $infile = shift;
my $id_admin = '23787404-089b-5efe-a8da-b207cbab9514';

if (! $infile) {
  die "Usage: ./items-scu.pl <ref_data_dir> <instance_map_file> <item_jsonl_file>\n";
}
if (! -e $infile) {
  die "Can't find Sierra items file!";
} 
my $dir = dirname($infile);
my $fn = basename($infile, '.jsonl', '.json');
my $rawfn = basename($infile);
my $ars_file = "$dir/ars.tsv";

my $files = {
  h => 'holdings.jsonl',
  i => 'items.jsonl',
  b => 'bound-withs.jsonl',
  r => 'relationships.jsonl',
  'm' => 'map.tsv',
  ip => 'purged.jsonl'
};

my $cntypes = {
  '050' => '95467209-6d7b-468b-94df-0f5d7ad2747d',
  '086' => 'fc388041-6cd0-4806-8a74-ebe3b9ab4c6e',
  '090' => '95467209-6d7b-468b-94df-0f5d7ad2747d',
  '092' => '03dd64d0-5626-4ecd-8ece-4531e0069f35',
  '099' => '6caca63e-5651-4db6-9247-3205156e9699',
};

my $inotes = {
  'x' => 'note',
  'g' => 'gift note',
  'r' => 'reserve history',
  '108' => 'note'
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
  my $uuid = create_uuid_as_string(UUID_V5, $text . $isil);
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
            my $name = '';
            if ($refroot =~ /^(instanceTypes|contributorTypes|instanceFormats|locations|statisticalCodes)$/) {
              $name = $_->{code};
            } else {
              $name = $_->{name};
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
      my $l = @col;
      my $code = ($l && $col[0] =~ /\w|\$/) ? $col[0] : '';
      $code =~ s/^ +| +$//g;
      my $name = $col[2] || '';
      if ($prop =~ /^(mtypes|loantypes)^/) {
        $code .= ':' . $col[1];
      }
      $name =~ s/^ +| +$//g;
      if ($prop eq 'statuses') {
        $tsvmap->{$prop}->{$code} = $col[3] || 'Available';
      } elsif ($prop eq 'mtypes-def') {
        $tsvmap->{mtypes_def}->{$code} = $refdata->{mtypes}->{$col[1]} if $code =~ /^\d*$/;
      } elsif ($prop eq 'loantypes-def') {
        $col[1] = lc $col[1];
        $tsvmap->{loantypes_def}->{$code} = $refdata->{loantypes}->{$col[1]} if $code =~ /^\d*$/;
      } else {
        $name = lc($name);
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

my $ars_map = {};
print "Opening ars map file...\n";
open ARS, $ars_file or die "Can't find ars.tsv file at $dir";
while (<ARS>) {
  chomp;
  my ($hrid, $temp, $perm) = split(/\t/);
  $ars_map->{$hrid} = [ $temp, $perm ];
}
# print Dumper($ars_map); exit;

$ref_dir =~ s/\/$//;
my $refdata = getRefData($ref_dir);
# print Dumper($refdata->{loantypes}); exit;
my $sierra2folio = makeMapFromTsv($ref_dir, $refdata);
$sierra2folio->{locations}->{multi} = $refdata->{locations}->{multi};
# print Dumper($sierra2folio->{loantypes_def}); exit;

my $relations = {
  '0' => 'Resource',
  '1' => 'Version of resource',
  '2' => 'Related resource',
  '3' => 'No information provided'
};

my $htype_map = {
  'a' => 'multi-volume monograph',
  'b' => 'serial',
  'c' => 'collection',
  'd' => 'sub collection',
  'i' => 'integrating resource',
  'm' => 'monograph',
  's' => 'serial'
};

my $msg_map = {
  'f'=>'On the Fly',
  'd'=>'Discarded',
  '1'=>'On Search 1',
  '2'=>'On Search 2',
  '3'=>'On Search 3',
  '4'=>'On Search 4',
  'w'=>'Discard Candidate'
};

my $count = 0;
my $hcount = 0;
my $icount = 0;
my $bcount = 0;
my $pcount = 0;
my $rcount = 0;
my $errcount = 0;
my $start = time();
my $inc = {};
my $bseen = {};
my $hseen = {};
my $cnmap = {};
my $hhrid = '';



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
open MOUT, '>>:encoding(UTF-8)', $paths->{m} or die "Can't open $paths->{m} for writing\n";
open IPURGE, '>>:encoding(UTF-8)', $paths->{ip} or die "Can't open $paths->{ip} for writing\n";

open IN, '<:encoding(UTF-8)', $infile;

while (<IN>) {
  chomp;
  my $obj = $json->decode($_);
  my $opacmsg = $obj->{fixedFields}->{108}->{value};
  if ($opacmsg eq 'z') {
    print IPURGE $_ . "\n";
    $pcount++;
    next;
  }
  my $bwc = 0;
  my $main_bib = 'b' . $obj->{bibIds}->[0];
  foreach my $it_bid (@{ $obj->{bibIds} }) {
    my $bid = "b$it_bid";
    if (!$inc->{$bid}) {
      $inc->{$bid} = 0;
    }
    my $psv = $inst_map->{$bid} || '';
    if (!$psv) {
      print "ERROR No map entry found for $bid (item: $obj->{id})\n";
      $errcount++;
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
    $bwc++;
    $hcount += $out->{hcount};
    $icount += $out->{icount};
    $bcount += $out->{bcount};
    $count++;
    if ($count % 10000 == 0) {
      print "$count items processed [ holdings: $hcount, items: $icount, bound-withs: $bcount, file: $rawfn]\n"
    }
  }
} 
close IN;

my $end = time() - $start;
print "---------------------------\n";
print "$count items processed in $end secs\n";
print "Holdings:  $hcount\n";
print "Items:     $icount\n";
print "Bounds:    $bcount\n";
print "Relations: $rcount\n";
print "Purges:    $pcount\n";
print "Errors:    $errcount\n";

sub make_hi {
  my $item = shift;
  my $bid = shift;
  my $bhrid = shift;
  my $cnfull = shift;
  my @cnparts = split /\^\^/, $cnfull;
  my $cnpre = $cnparts[0] || '';
  my $cn = $cnparts[1] || '';
  my $cntype = shift || '';
  my $bwc = shift;
  my $blevel = shift || '';
  my $hrec = {};
  my $holdings = '';
  my $items = '';
  my $hcount = 0;
  my $icount = 0;
  my $bcount = 0;
  my $bw;
  my $bws = '';
  my $repcn = { a=>0, b=>0 };
  my $url = '';
  my $urlnote = '';
  my $iid = 'i' . $item->{id};

  my $locs = $ars_map->{$iid};
  my $loc = ($locs) ? $locs->[1] : $item->{fixedFields}->{79}->{value};
  my $tloc = ($locs) ? $locs->[0] : '';
  my $cdate = $item->{fixedFields}->{83}->{value} || '';
  my $udate = $item->{fixedFields}->{84}->{value} || '';
  my $icode1 = $item->{fixedFields}->{59}->{value} || '0';
  my $scode = $sierra2folio->{statisticalCodes}->{$icode1} || '';
  my $metadata = make_meta($id_admin, $cdate, $udate);
  next if !$loc;
  $loc =~ s/(\s*$)//;
  my $locid = $sierra2folio->{locations}->{$loc} || print "ERROR FOLIO location not found for \"$loc\"!\n";
  my $vf = {};
  my $local_callno = 0;
  foreach my $f (@{ $item->{varFields} }) {
    my $ftag = $f->{fieldTag};
    if ($f->{content}) {
      push @{ $vf->{$ftag} }, $f->{content};
    } elsif ($f->{subfields}) {
      my @allsubs;
      foreach my $s (@{ $f->{subfields} }) {
        push @allsubs, $s->{content};
      }
      push @{ $vf->{$ftag} }, join ' ', @allsubs if $allsubs[0];
    }
    if ($ftag eq 'c')  {
      my $t = $f->{marcTag} || '';
      if ($t) {
        my @parts;
        foreach my $sf (@ {$f->{subfields}}) {
          if ($sf->{tag} eq 'f') {
            $cnpre = $sf->{content};
          } else {
            push @parts, $sf->{content};
          }
        }
        $cn = join ' ', @parts;
        $cntype = $cntypes->{$t} || $refdata->{callNumberTypes}->{'other scheme'}; 
      } else {
        $cn = $f->{content};
        $cntype = $refdata->{callNumberTypes}->{'other scheme'}; 
      }
      $local_callno = 1;
    } 
    if ($ftag eq 'y') {
      foreach my $sf (@{$f->{subfields}}) {
        if ($sf->{tag} eq 'u') {
          $url = $sf->{content};
        } elsif ($sf->{tag} eq 'z') {
          $urlnote = $sf->{content};
        }
      }
    }
  }
  my $write = ($repcn->{a} > 1 || $repcn->{b} > 1) ? 1 : 0;
  my $hfound = 0;

  # make holdings record from item;
  my $hkey = "$bhrid-$loc-$cn";
  my $hid = uuid($hkey);
  if (!$hseen->{$hkey})  {
    $inc->{$bhrid}++;
    my $incstr = sprintf("%03d", $inc->{$bhrid});
    my $hrid = "$bhrid-$incstr";
    my $bc = $vf->{b}[0] || '[No barcode]';
    $hrec->{id} = $hid;
    $hrec->{_version} = $ver;
    $hhrid = $hkey;
    $hrec->{hrid} = $hrid;
    $hrec->{instanceId} = $bid;
    $hrec->{permanentLocationId} = $locid;
    $hrec->{sourceId} = $refdata->{holdingsRecordsSources}->{folio} || '';
    my $htype = $htype_map->{$blevel} || '';
    $htype = lc($htype);
    $hrec->{holdingsTypeId} = $refdata->{holdingsTypes}->{$htype} || 'dc35d0ae-e877-488b-8e97-6e41444e6d0a'; #monograph
    if ($cn) {
      $hrec->{callNumber} = $cn;
      $hrec->{callNumberTypeId} = $cntype;
      $hrec->{callNumberPrefix} = $cnpre if $cnpre;
    }
    if ($bwc > 0) {
      my $hnote = {
        note => "Bound with $bc ($iid)",
        holdingsNoteTypeId => $refdata->{holdingsNoteTypes}->{note} || 'b160f13a-ddba-4053-b9c4-60ec5ea45d56',
        staffOnly => 'true'
      };
      push @{ $hrec->{notes} }, $hnote;
    }
    # my $lnote = {
    #  note => "Legacy location code: $loc",
    #  holdingsNoteTypeId => $refdata->{holdingsNoteTypes}->{provenance},
    #  staffOnly => JSON::true 
    # };
    # push @{ $hrec->{notes} }, $lnote;
    $hrec->{metadata} = $metadata;
    my $hout = $json->encode($hrec);
    $holdings .= $hout . "\n";
    $hseen->{$hkey} = 1;
    $hcount++;
    print MOUT "$hrid\t$hid\t$hkey\n";
  }

  # make item record;
  my $irec = {};
  my $itype = $item->{fixedFields}->{61}->{value};
  my $status = $item->{fixedFields}->{88}->{value} || '';
  my $bc = '';
  foreach (@{$vf->{b}}) {
    $bc = $_;
  }
  my @msgs = $vf->{m};
  my @xnotes;
  my @gnotes;
  my @rnotes;
  push @xnotes, @{ $vf->{x} } if $vf->{x};
  push @gnotes, @{ $vf->{g} } if $vf->{g};
  push @rnotes, @{ $vf->{r} } if $vf->{r};
  $status =~ s/\s+$//;
  if ($iid) {
    $irec->{_version} = $ver;
    $irec->{holdingsRecordId} = $hid;
    $irec->{barcode} = $bc if $bc && !$bseen->{$bc};
    $bseen->{$bc} = 1;
    $irec->{hrid} = $iid;
    $iid =~ s/^i//;
    $irec->{id} = uuid($iid);
    $irec->{statisticalCodeIds} = [ $scode ] if $scode;
    $irec->{volume} = $vf->{v}[0] if $vf->{v};
    $irec->{copyNumber} = $item->{fixedFields}->{58}->{value} || '';
    # if ($irec->{copyNumber}) {
    #  $irec->{copyNumber} = 'c.' . $irec->{copyNumber};
    # }
    if ($tloc && $sierra2folio->{locations}->{$tloc}) {
      $irec->{temporaryLocationId} = $sierra2folio->{locations}->{$tloc};
      $loc = $tloc;
    } elsif ($tloc) {
      print "WARN no temporary location found for \"$tloc\".\n"
    }
    my $mtkey = "$itype:$loc";
    $irec->{permanentLoanTypeId} = $sierra2folio->{loantypes}->{$mtkey} || $sierra2folio->{loantypes_def}->{$itype} || $refdata->{loantypes}->{'can circulate'};
    $irec->{materialTypeId} = $sierra2folio->{mtypes}->{$mtkey} || $sierra2folio->{mtypes_def}->{$itype} || $refdata->{mtypes}->{unspecified};
    if ($irec->{materialTypeId} eq '71fbd940-1027-40a6-8a48-49b44d795e46') {
      print "WARN FOLIO material type not found for $mtkey ($iid)\n";
    }
    if ($irec->{permanentLoanTypeId} eq '2b94c631-fca9-4892-a730-03ee529ffe27') {
      print "WARN FOLIO loan type not found for $mtkey ($iid)\n";
    }
    $irec->{status}->{name} = $sierra2folio->{statuses}->{$status} || 'Available'; # defaulting to available;
    my $msg = $item->{fixedFields}->{97}->{value} || '';
    my $msg_text = $msg_map->{$msg};
    if ($msg_text) {
      push @{ $vf->{m} }, $msg_text;
    }

    foreach my $note (@{ $vf->{m} }) {
      my @ntypes = ('Check out', 'Check in');
      foreach my $ntype (@ntypes) {
        my $cnobj = {};
        $cnobj->{id} = uuid($iid . $ntype);
        $cnobj->{note} = $note;
        $cnobj->{noteType} = $ntype;
        $cnobj->{staffOnly} = 'true';
        # $cnobj->{date} = "" . localtime;
        $cnobj->{date} = '2024-12-11T23:52:23.247+0000';
        push @{ $irec->{circulationNotes} }, $cnobj;
      }
    }
    foreach (@xnotes) {
      my $nobj = {};
      my $tname = $inotes->{x};
      $nobj->{note} = $_;
      $nobj->{itemNoteTypeId} = $refdata->{itemNoteTypes}->{$tname};
      $nobj->{staffOnly} = JSON::true;
      push @{ $irec->{notes} }, $nobj;
    }
    foreach (@gnotes) {
      my $nobj = {};
      my $tname = $inotes->{g};
      $nobj->{note} = $_;
      $nobj->{itemNoteTypeId} = $refdata->{itemNoteTypes}->{$tname};
      $nobj->{staffOnly} = JSON::true;
      push @{ $irec->{notes} }, $nobj;
    }
    foreach (@rnotes) {
      my $nobj = {};
      my $tname = $inotes->{r};
      $nobj->{note} = $_;
      $nobj->{itemNoteTypeId} = $refdata->{itemNoteTypes}->{$tname};
      $nobj->{staffOnly} = JSON::true;
      push @{ $irec->{notes} }, $nobj;
    }
    my $pubnote = $item->{fixedFields}->{108}->{display};
    if ($pubnote =~ /\w/) {
      my $nobj = {};
      my $tname = $inotes->{'108'};
      $nobj->{note} = $pubnote;
      $nobj->{itemNoteTypeId} = $refdata->{itemNoteTypes}->{$tname};
      $nobj->{staffOnly} = JSON::false;
      push @{ $irec->{notes} }, $nobj; 
    }
    if ($url) {
      my $ea = { uri=>$url, publicNote=>$urlnote };
      push @{ $irec->{electronicAccess} }, $ea;
    }
    
    my $icode2 = $item->{fixedFields}->{60}->{value};
    if ($icode2 eq 'y') {
      $irec->{discoverySuppress} = 'true';
    } else {
      $irec->{discoverySuppress} = 'false';
    }
    # if ($local_callno) {
      #$irec->{itemLevelCallNumber} = $cn;
      #$irec->{itemLevelCallNumberTypeId} = $cntype;
    #}

    if ($bwc == 0) {
      $irec->{metadata} = $metadata;
      my $iout = $json->encode($irec);
      $items .= $iout . "\n";
      $icount++;
    } else {
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
  }
  return {
    holdings => $holdings,
    items => $items,
    bws => $bws,
    hcount => $hcount,
    icount => $icount,
    bcount => $bcount,
    write => $write
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
