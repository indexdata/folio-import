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
use Time::Piece;
use Data::Dumper;
use Scalar::Util qw(reftype);

binmode(STDOUT, 'utf8');

my $isls = 'CStclU';
my $ver = $ENV{FOLIO_VERSION} || '1';

my @cntags = ('099', '090', '050');  # call number tags;
my $cntypes = {
  '050' => '95467209-6d7b-468b-94df-0f5d7ad2747d',
  '090' => '95467209-6d7b-468b-94df-0f5d7ad2747d',
  '099' => '6caca63e-5651-4db6-9247-3205156e9699',
};

my $rules_file = shift;
my $ref_dir = shift;
if (! $ARGV[0]) {
  die "Usage: ./marc2inst-scu.pl <mapping_rules> <ref_data_dir> <raw_marc_files>\n";
}

my $json = JSON->new;
$json->canonical();

my @lt = localtime();
my $mdate = sprintf("%04d-%02d-%02dT%02d:%02d:%02d-0500", $lt[5] + 1900, $lt[4] + 1, $lt[3], $lt[2], $lt[1], $lt[0]);

sub uuid {
  my $text = shift;
  my $uuid = create_uuid_as_string(UUID_V5, $text . $isls);
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
            my $id = $_->{id};
            if ($refroot eq 'contributorTypes') {
              my $n = lc $_->{name};
              my $c = $_->{code};
              $refobj->{$refroot}->{$n} = $id;
              $refobj->{$refroot}->{$c} = $id;
              next;
            } elsif ($refroot =~ /^(instanceTypes|instanceFormats)$/) {
              $name = $_->{code};
            } else {
              $name = $_->{name};
            }
            $name =~ s/\s+$//;
            $refobj->{$refroot}->{$name} = $id;
          }
        }
      }
    }
  }
 return $refobj;
}

$ref_dir =~ s/\/$//;
my $refdata = getRefData($ref_dir);
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
        if ($subs =~ /\Q$_->[0]\E/ && $_->[1] =~ /\S/) {
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
        if ($i % 2 && $subs =~ /\Q$sf\E/) {
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
    $out =~ s/^false false$/false/;
    $out =~ s/^true true$/true/;
  }
  return $out;
}

sub processing_funcs {
  my $out = shift || '';
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
    } elsif ($_ eq 'set_contributor_type_id_by_code_or_name') {
      my $cc = $params->{contributorCodeSubfield};
      my $nc = $params->{contributorNameSubfield};
      my $ccode = $field->subfield($cc);
      my $cname = $field->subfield($nc);
      if ($ccode) {
        $out = $refdata->{contributorTypes}->{$ccode};
      } elsif ($cname && !$out) {
        $cname =~ s/[,.]//g;
        $out = $refdata->{contributorTypes}->{$cname};
      }
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
        $out = $refdata->{instanceTypes}->{$code};
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
      if ($field->indicator(1) eq '0') {
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

my $infile = $ARGV[0];
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
my $badcount = 0;
my $purgecount = 0;
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

my $bad_path = $infile;
$bad_path =~ s/^(.+)\..+$/$1_bad.mrc/;
unlink $bad_path;

my $purge_path = $infile;
$purge_path =~ s/^(.+)\..+$/$1_purged.mrc/;
unlink $purge_path;
open PPATH, ">>:encoding(UTF-8)", $purge_path;

my $presuc_file = $infile;
$presuc_file =~ s/^(.+)\..+$/$1_presuc.jsonl/;
unlink $presuc_file;
open my $PSOUT, ">>:encoding(UTF-8)", $presuc_file;

my $snapshot_id = make_snapshot($snap_file);

# open a collection of raw marc records
$/ = "\x1D";

open RAW, "<:encoding(UTF-8)", $infile;
open my $OUT, ">>:encoding(UTF-8)", $save_path;
open my $SRSOUT, ">>:encoding(UTF-8)", $srs_file;
open IDMAP, ">>:encoding(UTF-8)", $id_map;

my $inst_recs;
my $srs_recs;
my $idmap_lines = '';
my $success = 0;
my $pcount = 0;
my $hrids = {};
while (<RAW>) {
  my $rec = {
    _version => $ver,
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
  my $raw = $_;
  my $marc;
  my $ok = eval {
    $marc = MARC::Record->new_from_usmarc($raw);
    1;
  };
  if (!$ok) {
    open BADOUT, ">>:encoding(UTF-8)", $bad_path;
    print BADOUT $raw;
    close BADOUT;
    $badcount++;
    next;
  };
  
  my $bcode3 = $marc->subfield('998', 'e');
  if ($bcode3 eq 'z') {
    print PPATH $raw;
    $purgecount++;
    next;
  } elsif ($bcode3 eq 'y') {
    $rec->{discoverySuppress} = JSON::true
  }

  # lets move the 001 to 035
  my $iiinum = '';
  foreach ($marc->field('907')) {
    $iiinum = $_->subfield('a') || '';
    last if ($iiinum =~ /^\.b\d\d\d/);
  }
  $iiinum =~ s/.(.+).$/$1/;
  if ($marc->field('001')) {
    my $in_ctrl = $marc->field('001')->data();
    my $in_ctrl_type = ($marc->field('003')) ? $marc->field('003')->data() : '';
    my $id_data = ($in_ctrl_type) ? "($in_ctrl_type)$in_ctrl" : $in_ctrl;
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

  # map catalogedDate from 998$b
  my $catdate = $marc->subfield('998',"b");
  if ($catdate =~ /\d{6}/) {
    if ($catdate =~ /^[0-2]/) {
      $catdate = "20$catdate";
    } else {
      $catdate = "19$catdate";
    }
    $catdate =~ s/(....)(..)(..)/$1-$2-$3/;
    $rec->{catalogedDate} = $catdate;
  }

  my @marc_fields = $marc->fields();
  my $f336seen = 0;
  MARC_FIELD: foreach my $field (@marc_fields) {
    print Dumper($field->tag());
    my $tag = $field->tag();
    if ($tag eq '336') {
      next if $f336seen == 1; 
      $f336seen = 1;
    }
    next unless $mapping_rules->{$tag} || $tag eq '880';  # No need to iterate through tags that aren't in the mapping rules
    my $field = $_;
    my $fr = $field_replace->{$tag} || '';
    if ($fr) {
      my $sf = $fr->{subfield}[0];
      my $sdata = $field->subfield($sf) || '';
      $sdata =~ s/^(\d{3}).*/$1/;
      my $rtag = $fr->{frules}->{$sdata} || $sdata;
      if ($rtag =~ /^\d{3}$/ && $rtag != '880') {
        $field->set_tag($rtag);
        push @marc_fields, $field;
      }
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
          my @ncode = ('');
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
          if ($tag eq '024') {
                if ($_->{indicators}) {
                  my $ind1 = $_->{indicators}->{ind1};
                  $ind1 =~ s/\*//;
                  next if $ind1 && $field->indicator(1) ne $ind1;
                } elsif ($field->indicator(1) =~ /[12]/) {
                  next;
                }
              }
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
          if ($_->{alternativeMapping}) {
            push @entity, $_->{alternativeMapping};
          }
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
  $rec->{identifiers} = dedupe(@{ $rec->{identifiers} });
  if (!$rec->{languages}[0]) {
    my $lang = $marc->subfield('998', 'f');
    $rec->{languages}[0] = $lang;
  }

  # delete duplicate contributor types.
  foreach (@{ $rec->{contributors} }) {
    if ($_->{contributorTypeId} && $_->{contributorTypeText}) {
      delete $_->{contributorTypeText};
    }
  }
  
  # Assign uuid based on hrid;
  if (!$rec->{hrid}) {
    $rec->{hrid} = sprintf("%4s%010d", "marc", $count);  # if there is no hrid, make one up.
  }
  my $hrid = $rec->{hrid};
  if (!$hrids->{$hrid} && $marc->title()) {
    # set FOLIO_USER_ID environment variable to create the following metadata object.
    $rec->{id} = uuid($hrid);
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
        my $pre = $marc->subfield($_, 'f') || '';
        $cn = "$pre^^$cn";
        $cntag = $_;
        last;
      }
    }
    
    $inst_recs .= $json->encode($rec) . "\n";
    my $electronic = ($rec->{electronicAccess}) ? $json->encode($rec->{electronicAccess}) : '';
    my $sraw = $marc->as_usmarc();
    $srs_recs .= $json->encode(make_srs($srsmarc, $sraw, $rec->{id}, $rec->{hrid}, $snapshot_id, $srs_file)) . "\n";
    my $ctype = $cntypes->{$cntag} || '';
    $idmap_lines .= "$rec->{hrid}|$rec->{id}|$cn|$ctype|$blevel|$electronic\n";
    $hrids->{$hrid} = 1;
    $success++;

    # make preceding succeding titles
    foreach my $f ($marc->field('78[05]')) {
      my $presuc = {};
      $presuc->{title} = $f->as_string('ast');
      if ($f->tag() eq '785') {
        $presuc->{precedingInstanceId} = $rec->{id};
      } else {
        $presuc->{succeedingInstanceId} = $rec->{id};
      }
      foreach my $sf (('w', 'x')) {
        my $idtype = $refdata->{identifierTypes}->{'Other standard identifier'};
        foreach ($f->subfield($sf)) {
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
      my $psid = create_uuid_as_string(UUID_V1);
      $presuc->{id} = $psid;
      write_objects($PSOUT, $json->encode($presuc) . "\n");
      $pcount++;
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

    print IDMAP $idmap_lines;
    $idmap_lines = '';
  }
}
my $tt = time() - $start;
print "\nDone!\n$count Marc records processed in $tt seconds";
print "\nInstances: $success ($save_path)";
print "\nPreSuc:    $pcount ($presuc_file)";
print "\nPurged:    $purgecount ($purge_path)";
print "\nErrors:    $errcount ($err_path)";
print "\nBad Marc:  $badcount ($bad_path)\n";

sub write_objects {
  my $fh = shift;
  my $recs = shift;
  print $fh $recs if $recs;
}

sub dedupe {
  my @out;
  my $found = {};
  foreach my $el (@_) {
    my $key = '';
    my $rt = reftype($el) || '';
    if ($rt eq 'HASH') {
      foreach my $k (sort keys %{ $el }) {
        $key .= $el->{$k};
      }
    } else {
      $key = $el;
    }
    $found->{$key}++;
    if ($found->{$key} < 2) {
      if ($rt eq 'HASH' || $el =~ /\w/) {
        push @out, $el;
      }
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
