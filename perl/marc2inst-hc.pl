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

use strict;
use warnings;

use MARC::Record;
use MARC::Record::MiJ;
use JSON;
use UUID::Tiny ':std';
use MARC::Charset 'marc8_to_utf8';
use Time::Piece;
use Data::Dumper;

binmode STDOUT, ":utf8";

my $itemtag = '945';
my @cntags = ('099', '090', '050', '092', '086');  # call number tags;
my $cntypes = {
  '050' => '95467209-6d7b-468b-94df-0f5d7ad2747d',
  '086' => 'fc388041-6cd0-4806-8a74-ebe3b9ab4c6e',
  '090' => '6caca63e-5651-4db6-9247-3205156e9699',
  '092' => '6caca63e-5651-4db6-9247-3205156e9699',
  '099' => '6caca63e-5651-4db6-9247-3205156e9699',
};
my $version = '4';
my $isls = 'MWH';

my $rules_file = shift;
my $ref_dir = shift;
if (! $ARGV[0]) {
  die "Usage: ./marc2inst.pl <mapping_rules> <ref_data_dir> <raw_marc_files>\n";
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
      my $name = $col[1] || '';
      if ($prop eq 'statuses') {
        $name =~ s/.*map .*/Unknown/;
        $tsvmap->{$prop}->{$code} = $name;
      } else {
        if ($prop =~ /mtypes|holdings-types/) {
          $name = $col[1];
        }
        $tsvmap->{$prop}->{$code} = $refdata->{$prop}->{$name};
      }
    }
  }
 return $tsvmap;
}

$ref_dir =~ s/\/$//;
my $refdata = getRefData($ref_dir);
my $sierra2folio = makeMapFromTsv($ref_dir, $refdata);
# print Dumper($sierra2folio); exit;
# print Dumper($refdata); exit;


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
      foreach (@{ $ent->{subFieldDelimiter} }) {
        my $subs = join '', @{ $_->{subfields} };
        push @data, $tmp_field->as_string($subs, $_->{value}) if $subs; 
      }
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
  series => 'array',
  identifiers => 'array.object',
  contributors => 'array.object',
  subjects => 'array',
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
      $repeat_subs->{$rtag} = [] unless $repeat_subs->{$rtag};
      foreach (@{ $conf->{entity} }) {
        push @{ $repeat_subs->{$rtag} }, $_->{subfield}->[0] if $_->{target} !~ /Id$/;
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
  my $start = time();

  my $save_path = $infile;
  $save_path =~ s/^(.+)\..+$/$1_instances.jsonl/;
  unlink $save_path;

  my $id_map = $infile;
  $id_map =~ s/^(.+)\..+$/$1.map/;
  unlink $id_map;

  my $snap_file = $infile;
  $snap_file =~ s/^(.+)\..+$/$1_snapshot.jsonl/;
  unlink $snap_file;

  my $srs_file = $infile;
  $srs_file =~ s/^(.+)\..+$/$1_srs.jsonl/;
  unlink $srs_file;
  
  my $err_path = $infile;
  $err_path =~ s/^(.+)\..+$/$1_err.mrc/;
  unlink $err_path;

  my $holdings_path = $infile;
  $holdings_path =~ s/^(.+)\..+$/$1_holdings.jsonl/;
  unlink $holdings_path;
  open my $HOUT, ">>:encoding(UTF-8)", $holdings_path;

  my $items_path = $infile;
  $items_path =~ s/^(.+)\..+$/$1_items.jsonl/;
  unlink $items_path;
  open my $IOUT, ">>:encoding(UTF-8)", $items_path;

  my $snapshot_id = make_snapshot($snap_file);
  
  # open a collection of raw marc records
  $/ = "\x1D";
 
  open RAW, "<:encoding(UTF-8)", $infile;
  open my $OUT, ">>:encoding(UTF-8)", $save_path;
  open my $SRSOUT, ">>:encoding(UTF-8)", $srs_file;
  open IDMAP, ">>:encoding(UTF-8)", $id_map;
  my $inst_recs;
  my $srs_recs;
  my $hold_recs;
  my $item_recs;
  my $idmap_lines;
  my $success = 0;
  my $hrids = {};
  my $coll = { instances => [] };
  while (<RAW>) {
    my $rec = {
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
      instanceTypeId => ''
    };
    
    $count++;
    my $raw;
    if ($_ =~ /^\d{5}....a/) {
      $raw = $_
    } else {
      $raw = marc8_to_utf8($_);
    }
    my $marc;
    my $ok = eval {
      $marc = MARC::Record->new_from_usmarc($raw);
      1;
    };
    next unless $ok;

    # lets move the 001 to 035
    my $iiinum = ($marc->field('907')) ? $marc->subfield('907', 'a') : '';
    $iiinum =~ s/.(.+).$/$1/;
    if ($marc->field('001')) {
      my $in_ctrl = $marc->field('001')->data();
      my $in_ctrl_type = ($marc->field('003')) ? $marc->field('003')->data() : '';
      my $id_data = "($in_ctrl_type)$in_ctrl";
      my $field = MARC::Field->new('035', ' ', ' ', 'a' => $id_data);
      $marc->insert_fields_ordered($field);
      $marc->field('001')->update($iiinum);
      if ($marc->field('003')) {
        $marc->field('003')->update($isls);
      } else {
        my $field = MARC::Field->new('003', $isls);
        $marc->insert_fields_ordered($field);  
      }
    } else {
      my $field = MARC::Field->new('001', $iiinum);
      $marc->insert_fields_ordered($field);
      if ($marc->field('003')) {
        $marc->field('003')->update($isls);
      } else {
        my $field = MARC::Field->new('003', $isls);
        $marc->insert_fields_ordered($field); 
      }
    }

    # III specific mapping for discoverySuppress
    if ($marc->subfield('998', 'e') eq 'n') {
      $rec->{discoverySuppress} = JSON::true;
    }

    my $srsmarc = $marc;
    if ($marc->field('880')) {
      $srsmarc = MARC::Record->new_from_usmarc($raw);
    }
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
    MARC_FIELD: foreach (@marc_fields) {
      my $field = $_;
      my $tag = $_->tag();
      my $fr = $field_replace->{$tag} || '';
      if ($fr) {
        my $sf = $fr->{subfield}[0];
        my $sdata = $field->subfield($sf);
        $sdata =~ s/^(\d{3}).*/$1/;
        my $rtag = $fr->{frules}->{$sdata} || $sdata;
        $field->set_tag($rtag);
        push @marc_fields, $field;
        next;
      }
      if (($tag =~ /^(7|1)/ && !$field->subfield('a')) || ($tag == '856' && !$field->subfield('u'))) {
        next;
      }
      
      # Let's determine if a subfield is repeatable, if so create append separate marc fields for each subfield;
      foreach (@{ $repeat_subs->{$tag} }) {
        my $main_code = $_;
        my $all_codes = join '', @{ $repeat_subs->{$tag} };
        my @sf = $field->subfield($main_code);
        my $occurence = @sf;
        if ($occurence > 1) {
          my $new_field = {};
          my $i = 0;
          my @subs = $field->subfields();
          foreach (@subs) {
            my ($code, $sdata) = @$_;
            if ($code eq $main_code) {
              $new_field = MARC::Field->new($tag, $field->{_ind1}, $field->{_ind2}, $code => $sdata);
            } elsif ($new_field->{_tag}) {
              $new_field->add_subfields($code => $sdata );
            }
            $i++;
            my @ncode = [''];
            if ($subs[$i]) {
              @ncode = @{ $subs[$i] };
            }
            push @marc_fields, $new_field if (index($all_codes, $ncode[0]) != -1 && $new_field->{_tag}) || !$ncode[0];
          }
          next MARC_FIELD;
        }
      }
      my $fld_conf = $mapping_rules->{$tag};
      my @entities;
      if ($fld_conf) {
        if ($fld_conf->[0]->{entity}) {
          foreach (@{ $fld_conf }) {
            if ($_->{entity}) {
              push @entities, $_->{entity};
            }
          }
        } else {
          @entities = $fld_conf;
        }
        foreach (@entities) {
          my @entity = @$_;
          my $data_obj = {};
          foreach (@entity) {
            if ($_->{target} =~ /precedingTitle|succeedingTitle/) {
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
    }
    # Do some some record checking and cleaning
    $rec->{subjects} = dedupe(@{ $rec->{subjects} });
    $rec->{languages} = dedupe(@{ $rec->{languages} });
    $rec->{series} = dedupe(@{ $rec->{series} });
    
    # Assign uuid based on hrid;
    if (!$rec->{hrid}) {
      $rec->{hrid} = sprintf("%4s%010d", "marc", $count);  # if there is no hrid, make one up.
    }
    my $hrid = $rec->{hrid};
    if (!$hrids->{$hrid} && $marc->title()) {
      # set FOLIO_USER_ID environment variable to create the following metadata object.
      $rec->{id} = uuid($hrid . $version);
      if ($ENV{FOLIO_USER_ID}) {
        $rec->{metadata} = {
          createdByUserId=>$ENV{FOLIO_USER_ID},
          updatedByUserId=>$ENV{FOLIO_USER_ID},
          createdDate=>$mdate,
          updatedDate=>$mdate
        };
      }
      my $cn = '';
      my $cntag = '';
      foreach (@cntags) {
        if ($marc->field($_)) {
          $cn = $marc->field($_)->as_string('ab', ' ');
          $cntag = $_;
          last;
        }
      }
      my $htype = ($marc->field('998')) ? $marc->subfield('998', 'd') : '';
      $htype =~ s/\s*$//;
      my $htype_id = $sierra2folio->{holdingsTypes}->{$htype} || '';
      $inst_recs .= $json->encode($rec) . "\n";
      $srs_recs .= $json->encode(make_srs($srsmarc, $raw, $rec->{id}, $rec->{hrid}, $snapshot_id, $srs_file)) . "\n";
      my $ctype = $cntypes->{$cntag} || '';
      $idmap_lines .= "$rec->{hrid}|$rec->{id}|$cn|$ctype|$htype_id\n";
      $hrids->{$hrid} = 1;
      $success++;

      # make holdings and items
      my $hi = make_hi($marc, $rec->{id}, $rec->{hrid}, $type, $blevel, $cn, $cntag, $htype_id);
      if ($hi->{holdings}) {
        $hold_recs .= $hi->{holdings};
        $hcount += $hi->{hcount};
      }
      if ($hi->{items}) {
        $item_recs .= $hi->{items};
        $icount += $hi->{icount};
      }

    } else {
      open ERROUT, ">>:encoding(UTF-8)", $err_path;
      print ERROUT $raw;
      close ERROUT;
      $errcount++;
    }
    if (eof RAW || $success % 10000 == 0) {
      my $tt = time() - $start;
      print "Processed #$count (" . $rec->{hrid} . ") [ instances: $success, holdings: $hcount, items: $icount, time: $tt secs ]\n";
      write_objects($OUT, $inst_recs);
      $inst_recs = '';

      write_objects($SRSOUT, $srs_recs);
      $srs_recs = '';

      write_objects($HOUT, $hold_recs);
      $hold_recs = '';

      write_objects($IOUT, $item_recs);
      $item_recs = '';

      print IDMAP $idmap_lines;
      $idmap_lines = '';
    }
  }
  my $tt = time() - $start;
  print "\nDone!\n$count Marc records processed in $tt seconds";
  print "\nInstances: $success ($save_path)";
  print "\nHoldings:  $hcount ($holdings_path)";
  print "\nItems:     $icount ($items_path)";
  print "\nErrors:    $errcount\n";
}

sub make_hi {
  my $marc = shift;
  my $bid = shift;
  my $bhrid = shift;
  my $type = shift;
  my $blevel = shift;
  my $cn = shift;
  my $cntag = shift;
  my $htype_id = shift;
  my $hseen = {};
  my $hid = '';
  my $hrec = {};
  my $holdings = '';
  my $items = '';
  my $hcount = 0;
  my $icount = 0;
  
  
  foreach my $item ($marc->field($itemtag)) {
    my $loc = $item->subfield('l') || '';
    next if !$loc;
    $loc =~ s/(\s*$)//;
    my $hkey = "$bhrid-$loc";
    my $locid = $refdata->{locations}->{$loc} || 'ce414bfd-ae34-4aae-be48-47d2825f1418'; # defaults to Unmapped location
    # make holdings record;
    if (!$hseen->{$hkey}) {
      $hid = uuid($hkey);
      $hrec->{id} = $hid;
      $hrec->{holdingsTypeId} = $htype_id if $htype_id;
      $hrec->{hrid} = $hkey;
      $hrec->{instanceId} = $bid;
      $hrec->{permanentLocationId} = $locid;
      if ($item->subfield('a') && $item->subfield('a') =~ /\w/) {
        $cn = $item->subfield('a');
      }
      if ($cn) {
        $hrec->{callNumber} = $cn;
        $hrec->{callNumberTypeId} = $cntypes->{$cntag} || '6caca63e-5651-4db6-9247-3205156e9699'; #other
      }
      my $hout = $json->encode($hrec);
      $holdings .= $hout . "\n";
      $hseen->{$hkey} = 1;
      $hcount++;
    }

    # make item record;
    my $irec = {};
    my $iid = $item->subfield('y');
    my $itype = $item->subfield('t');
    my $status = $item->subfield('s') || '';
    my @msgs = $item->subfield('m');
    my @notes = $item->subfield('n');
    $status =~ s/\s+$//;
    if ($iid) {
      $iid =~ s/^\.//;
      $irec->{id} = uuid($iid);
      $irec->{holdingsRecordId} = $hid;
      $irec->{hrid} = $iid;
      $irec->{barcode} = $item->subfield('i') || '';
      if ($blevel eq 's') {
        $irec->{enumeration} = $item->subfield('c') || '';
      } else {
        $irec->{volume} = $item->subfield('c') || '';
      }
      $irec->{copyNumber} = $item->subfield('g') || '';
      $irec->{permanentLoanTypeId} = $refdata->{loantypes}->{'Can Circulate'};
      $irec->{materialTypeId} = $sierra2folio->{mtypes}->{$itype} || '71fbd940-1027-40a6-8a48-49b44d795e46'; # defaulting to unspecified
      $irec->{status}->{name} = $sierra2folio->{statuses}->{$status} || 'Unknown'; # defaulting to available;
      foreach (@msgs) {
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
        $nobj->{itemNoteTypeId} = '8d0a5eca-25de-4391-81a9-236eeefdd20b';  # Note
        $nobj->{staffOnly} = 'true';
        push @{ $irec->{notes} }, $nobj;
      }
      if ($item->subfield('o') && $item->subfield('o') eq 'n') {
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
    my $srs_file = shift;
    my $srs = {};

    #### this control number stuff is preprocessed in the <RAW> block.
    # my $control = $marc->field('001');
    # my $new_ctrl_field = MARC::Field->new('001', $hrid);
    # if ($control) {
    #  my $sys_num = $control->data();
    #  if ($sys_num ne $hrid) {
    #    my $field = MARC::Field->new('035', ' ', ' ', a=>$sys_num);
    #   $marc->insert_fields_ordered($field);
    #    $control->replace_with($new_ctrl_field);
    #  }
    # } else {
    #  $marc->insert_fields_ordered($new_ctrl_field);
    # }

    my $mij = MARC::Record::MiJ->to_mij($marc);
    my $parsed = decode_json($mij);
    
    $srs->{id} = uuid($iid);
    my $nine = {};
    $nine->{'999'} = { subfields=>[ { 'i'=>$iid }, { 's'=>$srs->{id} } ] };
    $nine->{'999'}->{'ind1'} = 'f';
    $nine->{'999'}->{'ind2'} = 'f';
    push @{ $parsed->{fields} }, $nine;
    $srs->{snapshotId} = $snap_id;
    $srs->{matchedId} = $srs->{id};
    $srs->{recordType} = 'MARC_BIB';
    $srs->{generation} = 0;
    $srs->{rawRecord} = { id=>$srs->{id}, content=>$raw };
    $srs->{parsedRecord} = { id=>$srs->{id}, content=>$parsed };
    $srs->{externalIdsHolder} = { instanceId=>$iid, instanceHrid=>$hrid };
    return $srs;
}
