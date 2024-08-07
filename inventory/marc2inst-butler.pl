#! /usr/bin/perl

# Create instance records from raw marc using default (or updated) Folio mapping rules.
#
# There are couple of bash scripts that will fetch mapping rules and ref data:
#   get_mapping_rules.sh
#   reference_inventory.sh
#
# You must first create an okapi session by running login.sh to use the above scripts.
#
# Direct the output of get_mapping_rules.sh to some file, the reference_inventory.sh script
# will require a directory argument.
#
# This script will output a single instances collection and will be saved to the same
# directory as the raw marc file.
# 
# To add metadata, set FOLIO_USER_ID to user UUID (e.g. export FOLIO_USER_ID=b8e68b41-5473-5d0c-85c8-f4c4eb391b59)
# 
# For optomistic locking version set _VERSION to version number

use strict;
use warnings;

use MARC::Record;
use MARC::Record::MiJ;
use JSON;
use UUID::Tiny ':std';
use MARC::Charset 'marc8_to_utf8';
use Time::Piece;
use File::Basename;
use Data::Dumper;

my $ver = ($ENV{_VERSION}) ? $ENV{_VERSION} : '1';
binmode STDOUT, ":utf8";
$| = 1;

my $version = '1';
my $isil = 'BU';
my $prefix = 'bu';
my $srstype = 'MARC';
my @hnotes = qw(852z 907abcdefixy 931a 9613anwx 963adfghklnpqsw 9663abcdeqrw 9673aberw 990a);
my $source_id = 'f32d531e-df79-46b3-8932-cdd35f7a2264'; # FOLIO

my $rules_file = shift;
my $ref_dir = shift;
if (! $ARGV[0]) {
  die "Usage: ./marc2inst-butler.pl <mapping_rules> <ref_data_dir> <raw_marc_files>\n";
}
my $dir = dirname($ARGV[0]);

my $json = JSON->new;
$json->canonical();

my @lt = localtime();
my $mdate = sprintf("%04d-%02d-%02dT%02d:%02d:%02d-0500", $lt[5] + 1900, $lt[4] + 1, $lt[3], $lt[2], $lt[1], $lt[0]);

my $files = {
  inst => 'instances.jsonl',
  holds => 'holdings.jsonl',
  hsrs => 'holdings_srs.jsonl',
  items => 'items.jsonl',
  imap => 'map.tsv',
  srs => 'srs.jsonl',
  snap => 'snapshot.jsonl',
  presuc => 'presuc.jsonl',
  relate => 'relationships.jsonl',
  bwp => 'bound-with-parts.jsonl',
  err => 'err.mrc'
};

my $ifiles = {
};

my $sfiles = {
};

sub uuid {
  my $text = shift;
  my $uuid = create_uuid_as_string(UUID_V5, $text . $isil . $version);
  return $uuid;
}

sub getRules {
  my $rfile = shift;
  local $/ = '';
  open my $rules, $rfile or die "Can't open $rfile";
  my $jsonstr = <$rules>;
  my $json = decode_json($jsonstr);
  return $json;
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
            my $id = $_->{id};
            $name =~ s/\s+$//;
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
      my $code = $col[0] || '';
      my $name = $col[1] || '';
      if ($prop =~ /locations/) {
        $code = "$col[0] $col[1]";
        $name = $col[2];
        my $mtype = $col[5];
        my $ltype = $col[6];
        $tsvmap->{$prop}->{$code} = $refdata->{$prop}->{$name};
        $tsvmap->{mtypes}->{$code} = $refdata->{mtypes}->{$mtype};
        $tsvmap->{loantypes}->{$code} = $refdata->{loantypes}->{$ltype};
      }      
    }
  }
 return $tsvmap;
}


sub makeHridMap {
  my $dir = shift;
  my $hmap = {};
  my $fn = "$dir/hrid.map";
  open IDMAP, $fn or die "Can't open HRID map at $fn";
  while (<IDMAP>) {
    chomp;
    my @c = split /\t/;
    $c[0] =~ s/^au//;
    $hmap->{$c[0]} = $c[1];
  }
  return $hmap
}

my $refdata = getRefData($ref_dir);
my $tofolio = makeMapFromTsv($ref_dir, $refdata);
my $idmap = makeHridMap($dir);
# print Dumper($idmap); exit;
# print Dumper($tofolio); exit;
# print Dumper($refdata->{locations}); exit;

print "Loading items...\n";
my $items = {};
sub mapItems {
  foreach (sort keys %{ $ifiles }) {
    my $prop = $_;
    my $fn = $ifiles->{$_};
    my $path = "$dir/$fn";
    open ITD, "<:encoding(UTF-8)", $path or next;
    my $prekey = '';
    print "$prop\n";
    while (<ITD>) {
      s/[\r\n]//g;
      if ($prop eq 'notes' && $_ !~ /^\d+\t/ && $items->{$prop}->{$prekey}->[0]) {
        s/"\t.*//;
        $items->{$prop}->{$prekey}->[0] =~ s/^"//;
        $items->{$prop}->{$prekey}->[0] .= "\n$_";
        next;
      } 
      my @d = split /\t/, $_, 2;
      if ($prop =~ /mtypes|loantypes/) {
        my $rkey = $d[1];
        $items->{$prop}->{$d[0]} = $refdata->{$prop}->{$rkey};
      } else {
        push @{ $items->{$prop}->{$d[0]} }, $d[1] if ($d[0]);
      }
      $prekey = $d[0];
      if ($prop eq 'barcodes') {
        $d[1] =~ s/\t.+$//;
        $items->{bc2iid}->{$d[1]} = $d[0];
      }
      if ($prop eq 'items') {
        $d[1] =~ s/.+?\t(.+?)\t.+/$1/;
        $items->{iid2hid}->{$d[1]} = $d[0];
      }
    }
  }
}
mapItems();
# print Dumper ($items->{loantypes}); exit;

my $blvl = {
  'm' => 'Monograph',
  'i' => 'Integrating Resource',
  's' => 'Serial'
};

my $relations = {
  '0' => 'Resource',
  '1' => 'Version of resource',
  '2' => 'Related resource',
  '3' => 'No information provided'
};

my $pub_roles = {
  '0' => 'Production',
  '1' => 'Publication',
  '2' => 'Distribution',
  '3' => 'Manufacture',
  '4' => 'Copyright notice date'
};

my $rtypes = {
  'a' => 'txt',
  'c' => 'ntm',
  'd' => 'ntm',
  'e' => 'cri',
  'f' => 'cri',
  'm' => 'cop',
  'g' => 'tdi',
  'i' => 'spw',
  'j' => 'prm',
  'k' => 'sti',
  'o' => 'xxx',
  'p' => 'xxx',
  'r' => 'tdf',
  't' => 'txt'
};

sub process_entity {
  my $field = shift;
  my $ent = shift;
  my @data;
  my $out;
  my @rules;
  if ($ent->{rules}) {
    @rules = @{ $ent->{rules} };
  }
  my @funcs;
  my $default;
  my $params;
  my $tag = $field->tag();
  my $func_type;
  my $subs;
  if ($ent->{subfield}) {
    $subs = join '', @{ $ent->{subfield} };
  }
  foreach (@rules) {
    foreach (@{ $_->{conditions} }) {
      $func_type = $_->{type};
      @funcs = split /,\s*/, $_->{type};
      $params = $_->{parameter};
    }
    $default = $_->{value};
  }
  if ($tag =~ /^00/) {
    my $d;
    if ($default) {
      $d = $default;
    } else {
      $d = $field->data();
    }
    push @data, $d;
    $ent->{applyRulesOnConcatenatedData} = JSON::true;
  } elsif ($default || ($func_type && $func_type =~ /\bset_/ && $params)) {
    my $add = 0;
    if (!$subs) {
      $add = 1;
    } else {
      foreach ($field->subfields()) {
        if ($subs =~ /$_->[0]/ && $_->[1] =~ /\S/) {
          $add = 1;
          last;
        }
      }
    }
    if ($default) {
      push @data, $default if $add;
    } else {
      my $d = processing_funcs('', $field, $params, @funcs);
      push @data, $d if $add;
    }
  } else {
    my $tmp_field = $field->clone();
    if (!$ent->{applyRulesOnConcatenatedData}) {
      my $i = 0;
      my $sf;
      foreach (@{ $tmp_field->{_subfields} }) {
        if ($i % 2 && $subs =~ /$sf/) {
          $_ = processing_funcs($_, $tmp_field, $params, @funcs);
        } else {
          $sf = $_;
        }
        $i++;
      }
    }
    if ($ent->{subFieldDelimiter}) {
      my @sects;
      my $del = ' ';
      foreach (@{ $ent->{subFieldDelimiter} }) {
        my $subs = join '', @{ $_->{subfields} };
        if ($subs) {
          my $sdata = $tmp_field->as_string($subs, $_->{value}); 
          push @sects, $sdata if $sdata;
        } else {
          $del = $_->{value};
        }
      }
      push @data, join $del, @sects;
    } else {
      push @data, $tmp_field->as_string($subs) if $subs;
    }
  }
  
  if ($data[0]) {
    $out = join ' ', @data;
    $out = processing_funcs($out, $field, $params, @funcs) if $ent->{applyRulesOnConcatenatedData};
  }
  return $out;
}

sub processing_funcs {
  my $out = shift;
  my $field = shift;
  my $params = shift;
  foreach (@_) {
    if ($_ eq 'trim_period') {
      $out =~ s/\.\s*$//;
    } elsif ($_ eq 'trim') {
      $out =~ s/^\s+|\s+$//g;
    } elsif ($_ eq 'remove_ending_punc') {
      $out =~ s/[;:,\/+= ]$//g;
    } elsif ($_ eq 'remove_prefix_by_indicator') {
      my $ind = $field->indicator(2);
      if ($ind eq ' ') {
        $ind = 0;
      }
      if ($ind > 0 && length($out) > $ind) {
        $out = substr($out, $ind);
      }
    } elsif ($_ eq 'set_identifier_type_id_by_name') {
      my $name = $params->{name};
      $out = $refdata->{identifierTypes}->{$name} || '2e8b3b6c-0e7d-4e48-bca2-b0b23b376af5' 
    } elsif ($_ eq 'set_contributor_name_type_id') {
      my $name = $params->{name};
      $out = $refdata->{contributorNameTypes}->{$name} or die "Can't find contributorNameType for $name";
    } elsif ($_ eq 'set_contributor_type_id') {
      $out = $refdata->{contributorTypes}->{$out} || '';
    } elsif ($_ eq 'set_contributor_type_text') {
      # Not sure what's supposed to happen here...
    } elsif ($_ eq 'set_note_type_id') {
      my $name = $params->{name};
      $out = $refdata->{instanceNoteTypes}->{$name} or die "Can't find instanceNoteType for $name";
    } elsif ($_ eq 'set_alternative_title_type_id') {
      my $name = $params->{name};
      $out = $refdata->{alternativeTitleTypes}->{$name} || $refdata->{alternativeTitleTypes}->{'Other title'} or die "Can't find alternativeTitleType for $name";
    } elsif ($_ eq 'set_electronic_access_relations_id') {
      my $ind = $field->indicator(2);
      my $name = $relations->{$ind} || '';
      $out = $refdata->{electronicAccessRelationships}->{$name} || '';
    } elsif ($_ eq 'set_classification_type_id') {
      my $name = $params->{name};
      $out = $refdata->{classificationTypes}->{$name} or die "Can't find classificationType for $name";
    } elsif ($_ eq 'set_instance_format_id') {
      $out = $refdata->{instanceFormats}->{$out} || '';
    } elsif ($_ eq 'set_publisher_role') {
      my $ind2 = $field->indicator(2);
      $out = $pub_roles->{$ind2} || '';
    } elsif ($_ eq 'capitalize') {
      $out = ucfirst $out;
    } elsif ($_ eq 'char_select') {
      my $from = $params->{from};
      my $to = $params->{to};
      my $len = $to - $from;
      if (length($out) > $from) {
        $out = substr($out, $from, $len);
      }
    } elsif ($_ eq 'set_instance_type_id') {
      if ($field->tag() gt '009') {
        my $code = $field->subfield('b');
        $out = $refdata->{instanceTypes}->{$out};
      } else {
        $out = '';
      }
    } elsif ($_ eq 'set_issuance_mode_id') {
      $out = '';
    } elsif ($_ eq 'set_identifier_type_id_by_value') {
      my $name;
      my $data = $field->subfield('a');
      if ($data && $data =~ /^(\(OCoLC\)|ocm|ocn|on).*/) {
        $name = 'OCLC';
      } else {
        $name = 'System control number';
      }
      $out = $refdata->{identifierTypes}->{$name} or die "Can't find identifierType for $name";
    } elsif ($_ eq 'remove_substring') {
      my $ss = $params->{substring};
      $out =~ s/$ss//g;
    } elsif ($_ eq 'set_note_staff_only_via_indicator') {
      if ($field->indicator(1) eq '1') {
        $out = 'true';
      } else {
        $out = 'false';
      }
    }
  }
  return $out;
}

my $mapping_rules = getRules($rules_file);

my $ftypes = {
  id => 'string',
  hrid => 'string',
  source => 'string',
  title => 'string',
  indexTitle => 'string',
  alternativeTitles => 'array.object',
  editions => 'array',
  series => 'array.object',
  identifiers => 'array.object',
  contributors => 'array.object',
  subjects => 'array.object',
  classifications => 'array.object',
  publication => 'array.object',
  publicationFrequency => 'array',
  publicationRange => 'array',
  electronicAccess => 'array.object',
  instanceTypeId => 'string',
  instanceFormatIds => 'array',
  physicalDescriptions => 'array',
  languages => 'array',
  notes => 'array.object',
  modeOfIssuanceId => 'string',
  catalogedDate => 'string',
  previouslyHeld => 'boolean',
  staffSuppress => 'boolean',
  discoverySuppress => 'boolean',
  statisticalCodeIds => 'array',
  sourceRecordFormat => 'string',
  statusId => 'string',
  statusUpdatedDate => 'string',
  tags => 'object',
  holdingsRecords2 => 'array.object',
  administrativeNotes => 'array',
  natureOfContentTermIds => 'array.string'
};

# We need to know upfront which tags support repeated subfields or require preprocessing (think 880s).
my $field_replace = {};
my $repeat_subs = {};
foreach (keys %{ $mapping_rules }) {
  my $rtag = $_;
  foreach (@{ $mapping_rules->{$rtag} }) {
    if ($_->{entityPerRepeatedSubfield}) {
      my $conf = $_;
      $repeat_subs->{$rtag} = () unless $repeat_subs->{$rtag};
      foreach my $ent (@{ $conf->{entity} }) {
        foreach (@{$ent->{subfield}}) {
          push @{ $repeat_subs->{$rtag} }, $_ if $ent->{target} !~ /Id$/;
        }
      }
    }
    if ($_->{fieldReplacementBy3Digits}) {
      my $frules = {};
      foreach (@{ $_->{fieldReplacementRule} }) {
        $frules->{$_->{sourceDigits}} = $_->{targetField};
      }
      $_->{frules} = $frules;
      $field_replace->{$rtag} = $_;
      delete $mapping_rules->{$rtag};
    }
  }
}

my $bwmain = {};
foreach (@ARGV) {
  my $infile = $_;
  if (! -e $infile) {
    die "Can't find raw Marc file!"
  } elsif (! -e $ref_dir) {
    die "Can't find reference data directory!";
  } elsif (! -e $rules_file) {
    die "Can't find mapping rules file!";
  }
  
  my $count = 0;
  my $icount = 0;
  my $hcount = 0;
  my $errcount = 0;
  my $pcount = 0;
  my $rcount = 0;
  my $bwcount = 0;
  my $start = time();

  my $dir = dirname($infile);
  my $fn = basename($infile, '.mrc', '.marc', '.out');

  my $paths = {};
  foreach (keys %{ $files }) {
    my $suf = $files->{$_};
    my $save_file = "$dir/$fn-$suf";
    unlink $save_file;
    $paths->{$_} = $save_file;
  }

  open my $HOUT, ">>:encoding(UTF-8)", $paths->{holds};
  # open my $HSRSOUT, ">>:encoding(UTF-8)", $paths->{hsrs};
  open my $IOUT, ">>:encoding(UTF-8)", $paths->{items};
  open my $PSOUT, ">>:encoding(UTF-8)", $paths->{presuc};
  open my $ROUT, ">>:encoding(UTF-8)", $paths->{relate};
  open my $BWOUT, ">>:encoding(UTF-8)", $paths->{bwp};

  my $snapshot_id = make_snapshot($paths->{snap});
  
  # open a collection of raw marc records
  $/ = "\x1D";
 
  open RAW, "<:encoding(UTF-8)", $infile;
  open my $OUT, ">>:encoding(UTF-8)", $paths->{inst};
  open my $SRSOUT, ">>:encoding(UTF-8)", $paths->{srs};
  open IDMAP, ">>:encoding(UTF-8)", $paths->{imap};
  my $inst_recs;
  my $srs_recs;
  my $hrecs;
  # my $hsrs;
  my $irecs;
  my $idmap_lines = '';
  my $success = 0;
  my $skipped = 0;
  my $hrids = {};
  my $hrid;
  my $rec;
  while (<RAW>) {
    my $raw = $_;
    if (/^\d{5}.[uvxy] /) {
      my $h = make_holdings($raw, $snapshot_id);
      $hrecs .= $h->{holdings} . "\n";
      # $hsrs .= $h->{srs} . "\n";
      if ($h->{items}->[0]) {
        foreach (@{ $h->{items} }) {
          $irecs .= $json->encode($_) . "\n";
          $icount++;
        }
      }
      if ($h->{bwp}->[0]) {
        foreach (@{ $h->{bwp} }) {
          print $BWOUT $json->encode($_) . "\n";
          $bwcount++;
        }
      }
      $hcount++;
    } else {
      $rec = {
        id => '',
        alternativeTitles => [],
        editions => [],
        series => [],
        identifiers => [],
        contributors => [],
        subjects => [],
        classifications => [],
        publication => [],
        publicationFrequency => [],
        publicationRange => [],
        electronicAccess => [],
        instanceFormatIds => [],
        physicalDescriptions => [],
        languages => [],
        notes => [],
        staffSuppress => JSON::false,
        discoverySuppress => JSON::false,
        statisticalCodeIds => [],
        tags => {},
        holdingsRecords2 => [],
        natureOfContentTermIds => [],
        statusId => '52a2ff34-2a12-420d-8539-21aa8d3cf5d8',
        source => 'MARC',
        instanceTypeId => '',
        administrativeNotes => []
      };
      my $relid = '';
      $count++;
      #my $raw;
      #if ($_ =~ /^\d{5}....a/) {
      #  $raw = $_
      #} else {
      #  $raw = marc8_to_utf8($_);
      #}
      # my $marc;
      my $marc = eval {
        MARC::Record->new_from_usmarc($raw);
      };
      next unless $marc;
      my $exists = '';
      if ($marc->field('001')) {
        my $in_ctrl = $marc->field('001')->data();
        $in_ctrl =~ s/^[A-z]+//;
        $in_ctrl =~ s/ +$//;
        $exists = $idmap->{$in_ctrl};
        $hrid = $prefix . $in_ctrl;
        $marc->field('001')->data($hrid);
      }

      if (!$exists) {
        my $srsmarc = $marc->clone();
        my $ldr = $marc->leader();
        my $blevel = substr($ldr, 7, 1);
        my $type = substr($ldr, 6, 1);
        my $inst_type = $rtypes->{$type} || 'zzz';
        $rec->{instanceTypeId} = $refdata->{instanceTypes}->{$inst_type};
        my $mode_name = $blvl->{$blevel} || 'Other';

        my $lc_mode_name = lc $mode_name;
        if ($lc_mode_name eq 'monograph') { $lc_mode_name = 'single unit'}
        if ($refdata->{issuanceModes}->{$mode_name}) {
          $rec->{modeOfIssuanceId} = $refdata->{issuanceModes}->{$mode_name};
        } elsif ($refdata->{issuanceModes}->{$lc_mode_name}) {
          $rec->{modeOfIssuanceId} = $refdata->{issuanceModes}->{$lc_mode_name};
        } else {
          $rec->{modeOfIssuanceId} = $refdata->{issuanceModes}->{unspecified};
        }
        my @marc_fields = $marc->fields();
        MARC_FIELD: foreach my $field (@marc_fields) {
          my $tag = $field->tag();
          my $fr = $field_replace->{$tag} || '';
          if ($fr) {
            my $sf = $fr->{subfield}[0];
            my $sdata = $field->subfield($sf) || next;
            $sdata =~ s/^(\d{3}).*/$1/;
            my $rtag = $fr->{frules}->{$sdata} || $sdata;
            if ($rtag =~ /^\d\d\d$/) {
              $field->set_tag($rtag);
              push @marc_fields, $field;
            }
            next;
          }
          if (($tag =~ /^(70|71|1)/ && !$field->subfield('a')) || ($tag == '856' && !$field->subfield('u'))) {
            next;
          }
          
          # Let's determine if a subfield is repeatable, if so append separate marc fields for each subfield;
          foreach (@{ $repeat_subs->{$tag} }) {
            my $main_code = $_;
            my $all_codes = join '', @{ $repeat_subs->{$tag} };
            my @sf = $field->subfield($main_code);
            my $occurence = @sf;
            if ($occurence > 0 && !$field->{_seen}) {
              my $new_field = {};
              my $i = 0;
              my @subs = $field->subfields();
              foreach (@subs) {
                my ($code, $sdata) = @$_;
                $new_field = MARC::Field->new($tag, $field->{_ind1}, $field->{_ind2}, $code => $sdata);
                $new_field->{_seen} = 1;
                $i++;
                my @ncode = ('');
                if ($subs[$i]) {
                  @ncode = @{ $subs[$i] };
                }
                if ((index($all_codes, $ncode[0]) != -1 && $new_field->{_tag}) || !$ncode[0]) {
                  push @marc_fields, $new_field;
                }
              }
              next MARC_FIELD;
            } 
          }
          my $fld_conf = $mapping_rules->{$tag};
          my @entities;
          if ($fld_conf) {
            if ($fld_conf->[0]->{entity}) {
              foreach my $fc (@{ $fld_conf }) {
                if ($fc->{entity}) {
                  push @entities, $fc->{entity};
                }
              }
            } else {
              @entities = $fld_conf;
            }
            # print Dumper(@entities) if $tag eq '035';
            foreach (@entities) {
              my @entity = @$_;
              my $data_obj = {};
              foreach (@entity) {
                if ($_->{target} =~ /precedingTitle|succeedingTitle|authorityId/) {
                  next;
                }
                my @required;
                if ( $_->{requiredSubfield} ) {
                  @required = @{ $_->{requiredSubfield} };
                }
                if ($required[0] && !$field->subfield($required[0])) {
                  next;
                }
                my @targ;
                my $flavor;
                if ($_->{target}) {
                  @targ = split /\./, $_->{target};
                  $flavor = $ftypes->{$targ[0]};
                }
                # print Dumper($field) if $tag eq '035';
                # print Dumper($_) if $tag eq '035';
                
                my $data = process_entity($field, $_);
                next unless $data;
                if ($flavor eq 'array') {
                  my $first_targ_data = $rec->{$targ[0]};
                  if ($_->{subFieldSplit}) { # subFieldSplit is only used for one field, 041, which may have a lang string like engfreger.
                    my $val = $_->{subFieldSplit}->{value};
                    my @splitdata = $data =~ /(\w{$val})/g;
                    push @$first_targ_data, @splitdata;
                  } else {
                    push @$first_targ_data, $data;
                  }
                } elsif ($flavor eq 'array.object') {
                  $data_obj->{$targ[0]}->{$targ[1]} = $data;
                } elsif ($flavor eq 'object') {
                } elsif ($flavor eq 'boolean') {
                } else {
                  $rec->{$targ[0]} = $data;
                }
              }
              foreach (keys %$data_obj) {
                if ($ftypes->{$_} eq 'array.object') {
                  push @{ $rec->{$_} }, $data_obj->{$_};
                }
              }
            }
          }
          if ($tag eq '787') {
            $relid = $field->subfield('w') || '';
          }
        }
        # Do some some record checking and cleaning
        $rec->{subjects} = dedupe(@{ $rec->{subjects} });
        $rec->{languages} = dedupe(@{ $rec->{languages} });
        $rec->{series} = dedupe(@{ $rec->{series} });
        if ($marc->field('008')) {
          my $cd = $marc->field('008')->data();
          my $yr = substr($cd, 0, 2);
          my $mo = substr($cd, 2, 2);
          my $dy = substr($cd, 4, 2);
          if ($yr =~ /^[012]/) {
            $yr = "20$yr";
          } else {
            $yr = "19$yr";
          }
          $rec->{catalogedDate} = "$yr-$mo-$dy";
        }
        
        # Assign uuid based on hrid;
        my $hrid = $rec->{hrid};
        if (!$hrid) {
          die "No HRID found in record $count";
        }
        if (!$hrids->{$hrid} && $marc->title()) {
          # set FOLIO_USER_ID environment variable to create the following metadata object.
          $rec->{id} = uuid($hrid);
          $rec->{_version} = $ver;
          if ($ENV{FOLIO_USER_ID}) {
            $rec->{metadata} = {
              createdByUserId=>$ENV{FOLIO_USER_ID},
              updatedByUserId=>$ENV{FOLIO_USER_ID},
              createdDate=>$mdate,
              updatedDate=>$mdate
            };
          }
          if ($relid) {
            my $superid = uuid($relid);
            my $rtype = $refdata->{instanceRelationshipTypes}->{'bound-with'};
            my $relobj = { superInstanceId=>$superid, subInstanceId=>$rec->{id}, instanceRelationshipTypeId=>$rtype };
            print $ROUT $json->encode($relobj) . "\n";
            $rcount++;
          }
          $inst_recs .= $json->encode($rec) . "\n";
          $srs_recs .= $json->encode(make_srs($srsmarc, $raw, $rec->{id}, $rec->{hrid}, $snapshot_id)) . "\n";
          $idmap_lines .= "$rec->{hrid}\t$rec->{id}\n";
          $hrids->{$hrid} = 1;
          $success++;

          # make preceding succeding titles
          foreach my $f ($marc->field('78[05]')) {
          my $presuc = {};
          my $pstype = 1;
          $presuc->{title} = $f->as_string('ast');
          if ($f->tag() eq '785') {
            $presuc->{precedingInstanceId} = $rec->{id};
          } else {
            $presuc->{succeedingInstanceId} = $rec->{id};
            $pstype = 2;
          }
          foreach my $sf (('w', 'x')) {
            my $idtype = $refdata->{identifierTypes}->{'Other standard identifier'};
            foreach ($f->subfield($sf)) {
              if ($sf eq 'w') {
                my $instid = uuid($_);
                if ($pstype == 1) {
                  $presuc->{succeedingInstanceId} = $instid;
                } else {
                  $presuc->{precedingInstanceId} = $instid;
                }
              } 
              if (/OCoLC|ocm|ocn/) {
                $idtype = $refdata->{identifierTypes}->{'OCLC'};
              } elsif (/DLC/) {
                $idtype = $refdata->{identifierTypes}->{'LCCN'};
              } elsif (/^\d{4}-[0-9Xx]{4}/) {
                $idtype = $refdata->{identifierTypes}->{'ISSN'};
              } elsif (/^[0-9Xx]{10,13}/) {
                $idtype = $refdata->{identifierTypes}->{'ISBN'};
              }
              my $idObj = { value=>$_, identifierTypeId=>$idtype };
              push @{ $presuc->{identifiers} }, $idObj;
            }
          }
          write_objects($PSOUT, $json->encode($presuc) . "\n");
          $pcount++;
        }

        } else {
          open ERROUT, ">>:encoding(UTF-8)", $paths->{err};
          print ERROUT $raw;
          close ERROUT;
          $errcount++;
        }
      } else {
        $skipped++;
      }
    }
    if (eof RAW || $success % 10000 == 0) {
      my $tt = time() - $start;
      print "Processed #$count (" . $rec->{hrid} . ") [ instances: $success, holdings: $hcount, items: $icount, time: $tt secs ]\n" if $rec->{hrid};
      write_objects($OUT, $inst_recs);
      $inst_recs = '';

      write_objects($SRSOUT, $srs_recs);
      $srs_recs = '';

      print IDMAP $idmap_lines;
      $idmap_lines = '';

      if ($hrecs) {
        print $HOUT $hrecs;
        $hrecs = '';
      }

      # if ($hsrs) {
        # print $HSRSOUT $hsrs;
        # $hsrs = '';
      # }

      if ($irecs) {
        print $IOUT $irecs;
        $irecs = '';
      }
    }
  } 
  my $tt = time() - $start;
  print "\nDone!\n$count Marc records processed in $tt seconds";
  print "\nSkipped:     $skipped";
  print "\nInstances:   $success ($paths->{inst})";
  print "\nHoldings:    $hcount ($paths->{holds})";
  print "\nItems:       $icount ($paths->{items})";
  print "\nPre-suc:     $pcount ($paths->{presuc})";
  print "\nRelations:   $rcount ($paths->{relate}";
  print "\nBound-withs: $bwcount ($paths->{bwp})";
  print "\nErrors:      $errcount\n";
}

sub make_holdings {
  my $raw = shift;
  my $snap_id = shift;
  my $marc = eval { 
    MARC::Record->new_from_usmarc($raw)
  };
  my $id = $marc->field('001')->data();
  my $bid = $marc->field('004')->data();
  $bid =~ s/^oc.//;
  $bid =~ s/ +$//;
  my $existsId = $idmap->{$bid};
  $bid = $prefix . $bid;
  my $lfield = $marc->field('852');
  my $loc = $lfield->as_string('bc');
  my $cn = $lfield->as_string('hi');
  my $cntype = $lfield->indicator(1);
  my $subw = $lfield->as_string('w');
  my $cnpre = $lfield->as_string('k');
  my $cnsuf = $lfield->as_string('m');
  my $copy = $lfield->as_string('t');
  my @xnotes = $lfield->subfield('x');
  my @znotes = $lfield->subfield('z');
  my $cntype_str = '';
  if ($cntype eq '0') {
    $cntype_str = 'Library of Congress classification'; 
  } elsif ($cntype eq '1') {
    $cntype_str = 'Dewey Decimal classification';
  } elsif ($cntype eq '3') {
    $cntype_str = 'Superintendent of Documents classification';
  } elsif ($cntype eq '5') {
    $cntype_str = 'Title';
  } elsif ($cntype eq '6') {
    $cntype_str = 'Shelved separately';
  } else {
    $cntype_str = 'Other scheme';
  }
  my @f655 = $marc->field('655');

  my $hrid = $prefix . $id;
  my $hid = uuid($hrid);

  my $hr = {};
  $hr->{_version} = $ver;
  $hr->{id} = $hid;
  $hr->{instanceId} = ($existsId) ? $existsId : uuid($bid);
  $hr->{hrid} = $hrid;
  $hr->{permanentLocationId} = $tofolio->{locations}->{$loc} || '';
  $hr->{sourceId} = $source_id;
  if (!$hr->{permanentLocationId}) { 
    $hr->{permanentLocationId} = $refdata->{locations}->{'EDUCERROR'};
    print "WARN FOLIO location not found for $loc! ($id)\n";
  }
  $hr->{callNumberPrefix} = $cnpre if $cnpre;
  $hr->{callNumber} = $cn if $cn;
  $hr->{callNumberTypeId} = $refdata->{callNumberTypes}->{$cntype_str} if $cntype_str =~ /\w/ && $cn;
  $hr->{callNumberSuffix} = $cnsuf if $cnsuf;
  $hr->{discoverySuppress} = JSON::false;
  foreach (@f655) {
    my $val = $_->as_string('a');
    if ($_->{_ind1} eq '7' && $_->{_ind2} eq '7' && $val eq 'Suppressed') {
      $hr->{discoverySuppress} = JSON::true; 
    }
  }
  foreach (@xnotes) {
    my @notes = make_notes($_, 'Note', 1);
    if ($notes[0]) {
      push @{ $hr->{notes} }, @notes;
    }
  }
  foreach (@znotes) {
    my @notes = make_notes($_, 'Note', 1);
    if ($notes[0]) {
      push @{ $hr->{notes} }, @notes;
    }
  }
  foreach ($marc->field('866')) {
    my $text = $_->as_string('vy');
    if ($text) {
      my $n = $_->as_string('z') || '';
      my $s = make_statement($text, $n);
      push @{ $hr->{holdingsStatements} }, $s;
    }
  }
  foreach ($marc->field('856')) {
    my $u = $_->as_string('u');
    if ($u) {
      my $lt = $_->as_string('z');
      my $pn = $_->as_string('ir');
      my $rel = $_->{_ind2};
      my $relstr = $relations->{$rel} || 'No information provided';
      my $ea = { uri => $u };
      $ea->{linkText} = $lt if $lt;
      $ea->{publicNote} = $pn if $pn;
      $ea->{relationshipId} = $refdata->{electronicAccessRelationships}->{$relstr};
      push @{ $hr->{electronicAccess} }, $ea;
    }
  }

  # make items 

  my $out;
  my $inc = 0;
  foreach ($marc->field('876')) {
    my $bc = $_->as_string('p');
    my @xnotes = $_->subfield('x');
    my @znotes = $_->subfield('z');
    $inc++;
    my $incstr = sprintf("%03d", $inc);
    my $ihrid = "$hrid-$incstr";
    my $iid = uuid($ihrid);
    my $mtype = $tofolio->{mtypes}->{$loc} || $refdata->{mtypes}->{unspecified};
    my $ltype = $tofolio->{loantypes}->{$loc};
    if ($bc) {
      my $ir = {
        id=>$iid,
        holdingsRecordId=>$hid,
        hrid=>$ihrid,
        barcode=>$bc,
        materialTypeId=>$mtype,
        permanentLoanTypeId=>$ltype,
        status=>{ name=>'Available' }
      };
      $ir->{copyNumber} = "c.$copy" if $copy && $copy ne '1';
      foreach (@xnotes) {
        my @notes = make_notes($_, 'Note', 1, 1);
        if ($notes[0]) {
          push @{ $ir->{notes} }, @notes;
        }
      }
      foreach (@znotes) {
        my @notes = make_notes($_, 'Note', 1, 1);
        if ($notes[0]) {
          push @{ $ir->{notes} }, @notes;
        }
      }
      push @{ $out->{items} }, $ir;
    }
  }

  # my @items = make_items($hr->{hrid}, $hr->{id}, $hr->{callNumberTypeId});
  # push @{ $out->{items} }, @items;
  # if ($subw && $items->{bc2iid}->{$subw}) {
    # my $ihrid = $items->{bc2iid}->{$subw};
    # my $itemid = uuid($ihrid);
    # if (!$bwmain->{$subw} && $items->{iid2hid}->{$ihrid}) {
      # my $hhrid = $items->{iid2hid}->{$ihrid};
      # my $bw = {
        # holdingsRecordId => uuid($hhrid),
        # itemId => $itemid,
        # id => uuid($hhrid . $itemid)
      # };
      # push @{ $out->{bwp} }, $bw;
    # }
    # my $bw = {
      # holdingsRecordId => $hr->{id},
      # itemId => $itemid,
      # id => uuid($hr->{id} . $itemid)
    # };
    # push @{ $out->{bwp} }, $bw;
    # $bwmain->{$subw} = 1;
    # my $hnote = {
      # note => "Bound with $subw",
      # holdingsNoteTypeId => $refdata->{holdingsNoteTypes}->{Binding},
      # staffOnly => 'true'
    # };
    # push @{ $hr->{notes} }, $hnote;
  # }

  $out->{holdings} = $json->encode($hr);
  # $out->{srs} = $json->encode($srs);
  return $out;
}

sub make_items {
  my $hhrid = shift;
  my $hid = shift;
  my $cntype = shift || '';
  $hhrid =~ s/^[A-L]+//;
  my @out;
  foreach (@{ $items->{items}->{$hhrid} }) {
    my @c = split /\t/, $_;
    my $link = $c[1];
    my $id = $link;
    my $ir = {
      id => uuid($id),
      _version => $ver,
      holdingsRecordId => $hid,
      hrid => $id,
      copyNumber => $c[5],
    };
    if ($c[6]) {
      $ir->{itemLevelCallNumber} = $c[6];
      $ir->{itemLevelCallNumberTypeId} = $cntype;
    }
    $ir->{enumeration} = $c[7] if $c[7];
    $ir->{chronology} = $c[8] if $c[8];
    push @{ $ir->{yearCaption} }, $c[9] if $c[9];
    $ir->{numberOfPieces} = $c[10] if $c[10];
    $ir->{status}->{name} = 'Available';
    my $effloc = $c[12];
    my $permloc = $c[3];
    my $locid = $refdata->{locations}->{$permloc} || '';
    if ($locid) {
      $ir->{permanentLocationId} = $locid;
    }
    my $lt = $c[2];
    $ir->{permanentLoanTypeId} = $items->{loantypes}->{$lt} || $refdata->{loantypes}->{'Can circulate'};
    my $bc = $items->{barcodes}->{$link}->[0] || '';
    if ($bc) {
      $bc =~ s/\t.+//;
      $ir->{barcode} = $bc;
    }
    my $nt = $items->{notes}->{$link};
    foreach (@{ $nt }) {
      s/\t.+//;
      my $n = {
        note => $_,
        staffOnly => 'true'
      };
      $n->{itemNoteTypeId} = $refdata->{itemNoteTypes}->{Note};
      push @{ $ir->{notes} }, $n;
    }
    my $sc = ($items->{statcodes}->{$link}) ? $items->{statcodes}->{$link}->[0] : '';
    $ir->{materialTypeId} = $items->{mtypes}->{$effloc} || $refdata->{mtypes}->{unspecified} || die "Can't set material type for $id"; 
    my $tmploc = $c[4];
    if ($tmploc && $refdata->{locations}->{$tmploc}) {
      $ir->{temporaryLocationId} = $refdata->{locations}->{$tmploc};
    }
    push @out, $ir;
  }
  return @out;
}

sub make_notes {
  my $text = shift;
  my $type = shift || 'Note';
  my $staff = shift;
  my $isitem = shift;
  my @notes;
  my $n = {};
  $n->{note} = $text;
  if ($isitem) {
    $n->{itemNoteTypeId} = $refdata->{itemNoteTypes}->{$type};
  } else {
    $n->{holdingsNoteTypeId} = $refdata->{holdingsNoteTypes}->{$type};
  }
  if ($staff) {
    $n->{staffOnly} = JSON::true;
  } else {
    $n->{staffOnly} = JSON::false;
  }
  $n;
}

sub make_statement {
  my $text = shift;
  my $note = shift;
  my $snote = shift;
  my $s = {};
  $s->{statement} = $text;
  $s->{note} = $note if $note;
  $s->{staffNote} = $snote if $snote;
  return $s;
}

sub write_objects {
  my $fh = shift;
  my $recs = shift;
  print $fh $recs if $recs;
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

sub make_snapshot {
  my $snap_path = shift;
  my @t = localtime();
  my $dt = sprintf("%4s-%02d-%02d", $t[5] + 1900, $t[4] + 1, $t[3]);
  my $snap_id = uuid($dt);
  my $snap = {
    jobExecutionId=>$snap_id,
    status=>"COMMITTED",
    processingStartedDate=>"${dt}T00:00:00"
  };
  print "Saving snapshot object to $snap_path...\n";
  open SNOUT, ">$snap_path";
  print SNOUT JSON->new->encode($snap) . "\n";
  close SNOUT;
  return $snap_id;
}

sub make_srs {
    my $marc = shift;
    my $raw = shift;
    my $iid = shift;
    my $hrid = shift;
    my $snap_id = shift;
    my $hid = shift || '';
    my $srs = {};
    if ($hid && $marc->field('852')) {
      my $field = $marc->field('852');
      if ($field->subfield('b')) {
        my $loc = $field->subfield('b');
        $loc = "LANE-$loc";
        $field->update('b' => $loc);
      }
    }

    my $mij = MARC::Record::MiJ->to_mij($marc);
    my $parsed = decode_json($mij);
    
    $srs->{id} = uuid($iid . 'srs');
    my $nine = {};
    $nine->{'999'} = { subfields=>[ { 'i'=>$iid || $hid }, { 's'=>$srs->{id} } ] };
    $nine->{'999'}->{'ind1'} = 'f';
    $nine->{'999'}->{'ind2'} = 'f';
    push @{ $parsed->{fields} }, $nine;
    $srs->{snapshotId} = $snap_id;
    $srs->{matchedId} = $srs->{id};
    $srs->{generation} = 0;
    $srs->{rawRecord} = { id=>$srs->{id}, content=>$raw };
    $srs->{parsedRecord} = { id=>$srs->{id}, content=>$parsed };
    if ($hid) {
      $srs->{externalIdsHolder} = { holdingsId=>$hid, holdingsHrid=>$hrid };
      $srs->{recordType} = 'MARC_HOLDING';
    }
    else {
      $srs->{externalIdsHolder} = { instanceId=>$iid, instanceHrid=>$hrid };
      $srs->{recordType} = 'MARC_BIB';
    }
    return $srs;
}
