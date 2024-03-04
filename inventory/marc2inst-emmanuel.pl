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
my $isil = 'mbemm';
my $prefix = 'm';
my $hprefix = "${prefix}h";
my $iprefix = "${prefix}i";
my $srstype = 'MARC';
my $source_id = 'f32d531e-df79-46b3-8932-cdd35f7a2264'; # Folio 

my $rules_file = shift;
my $ref_dir = shift;
if (! $ARGV[0]) {
  die "Usage: ./marc2inst-wit.pl <mapping_rules> <ref_data_dir> <raw_marc_files>\n";
}
my $dir = dirname($ARGV[0]);

my $json = JSON->new;
$json->canonical();

my @lt = localtime();
my $mdate = sprintf("%04d-%02d-%02dT%02d:%02d:%02d-0500", $lt[5] + 1900, $lt[4] + 1, $lt[3], $lt[2], $lt[1], $lt[0]);

my $files = {
  inst => 'instances.jsonl',
  holds => 'holdings.jsonl',
  items => 'items.jsonl',
  imap => 'map.tsv',
  srs => 'srs.jsonl',
  snap => 'snapshot.jsonl',
  presuc => 'presuc.jsonl',
  err => 'err.mrc'
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
      my $code = $col[0] || '';
      my $name = $col[1] || '';
      if ($prop eq 'locations') {
        $name = $col[7] || '';
      } elsif ($prop eq 'mtypes') {
        $name = $col[6] || '';
      } 
      if ($prop eq 'status') {
        if ($name eq 'N/A' || $code eq 'Charged') {
          $name = 'Available';
        }
        $tsvmap->{$prop}->{$code} = $name;
      } else {
        $tsvmap->{$prop}->{$code} = $refdata->{$prop}->{$name} if $refdata->{$prop}->{$name};
      }
    }
  }
 return $tsvmap;
}

$ref_dir =~ s/\/$//;
my $refdata = getRefData($ref_dir);
my $tofolio = makeMapFromTsv($ref_dir, $refdata);
# print Dumper($tofolio->{locations}); exit;
# print Dumper($refdata->{locations}); exit;

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

my $typemap = {
  'x' => 'Monograph',
  'y' => 'Serial',
  'v' => 'Multi-part monograph',
  'u' => 'Monograph'
};

my $statmap = {
  'Damaged' => 'Unavailable',
  'In Transit Discharged' => 'In transit',
  'In Transit On Hold' => 'In transit',
  'Lost--Library Applied' => 'Declared lost',
  'Missing' => 'Missing',
  'Withdrawn' => 'Declared lost'
};

my $bcseen = {};
my $hrseen = {};

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
  my $idmap_lines;
  my $success = 0;
  my $hrids = {};
  my $rec;
  while (<RAW>) {
    my $raw = $_;
    if (/^\d{5}.[uvxy] /) {
      my $h = make_holdings($raw, $snapshot_id);
      if ($h) {
        $hrecs .= $h->{holdings} . "\n";
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
      }
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
        instanceTypeId => ''
      };
      my $relid = '';
      $count++;
      my $marc = eval {
        MARC::Record->new_from_usmarc($raw);
      };
      next unless $marc;
      if ($marc->field('001')) {
        my $in_ctrl = $marc->field('001')->data();
        $marc->field('001')->update("$prefix$in_ctrl");
      }

      my $srsmarc = $marc;
      if ($marc->field('880')) {
        $srsmarc = $marc->clone();
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
      my $f336seen = 0;
      MARC_FIELD: foreach my $field (@marc_fields) {
        my $tag = $field->tag();
        if ($tag eq '336') {
          next if $f336seen == 1; 
          $f336seen = 1;
        }
        my $fr = $field_replace->{$tag} || '';
        if ($fr) {
          my $sf = $fr->{subfield}[0];
          my $sdata = $field->subfield($sf) || next;
          $sdata =~ s/^(\d{3}).*/$1/;
          my $rtag = $fr->{frules}->{$sdata} || $sdata;
          if ($rtag ne '880' && $rtag =~ /^\d\d\d$/) {
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
                if ($_->{subFieldSplit}) { # subFieldSplit is only used for one field, 041, which may have a lang string like engfreger.
                  my $val = $_->{subFieldSplit}->{value};
                  my @splitdata = $data =~ /(\w{$val})/g;
                  push @{ $rec->{$targ[0]} }, @splitdata;
                } else {
                  push @{ $rec->{$targ[0]} }, $data;
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

      # delete duplicate contributor types.
      foreach (@{ $rec->{contributors} }) {
        if ($_->{contributorTypeId} && $_->{contributorTypeText}) {
          delete $_->{contributorTypeText};
        }
      }
      
      # Assign uuid based on hrid;
      if (!$rec->{hrid}) {
        die "No HRID found in record $count";
      }
      my $hrid = $rec->{hrid};
      if (!$hrids->{$hrid} && $marc->title()) {
        my $f908 = $marc->field('908');
        if ($f908 && $f908->subfield('x') && $f908->subfield('x') eq 'Y') {
          $rec->{discoverySuppress} = JSON::true;
        }
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
              if ($sf eq 'Z') {
                my $instid = uuid($prefix . $_);
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
        if ($hrids->{$hrid}) {
          print "ERROR Duplicate HRID: $hrid\n";
        } 
        if (!$rec->{title}) {
          print "ERROR $hrid has no title\n"
        }
        open ERROUT, ">>:encoding(UTF-8)", $paths->{err};
        print ERROUT $raw;
        close ERROUT;
        $errcount++;
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
      #  print $HSRSOUT $hsrs;
      #  $hsrs = '';
      # }

      if ($irecs) {
        print $IOUT $irecs;
        $irecs = '';
      }
    }
  }
  my $tt = time() - $start;
  print "\nDone!\n$count Marc records processed in $tt seconds";
  print "\nInstances:   $success ($paths->{inst})";
  print "\nHoldings:    $hcount ($paths->{holds})";
  print "\nItems:       $icount ($paths->{items})";
  print "\nPre-suc:     $pcount ($paths->{presuc})";
  print "\nErrors:      $errcount\n";
}

sub make_holdings {
  my $raw = shift;
  my $snap_id = shift;
  my $marc = eval { 
    MARC::Record->new_from_usmarc($raw)
  };
  my $ldr = $marc->leader();
  my $tcode = $ldr;
  $tcode =~ s/^......(.).+/$1/;
  my $id = $marc->field('001')->data();
  my $bid = $marc->field('004')->data();
  if ($hrseen->{$id}) {
    print "WARN Holdings record $id already seen-- Skipping...\n";
    return '';
  }
  $hrseen->{$id} = 1;

  my $lfield;
  my @snotes;
  my @pnotes;
  foreach ($marc->field('852')) {
    if ($_->subfield('b')) {
      $lfield = $_;
    } else {
      push @snotes, $_->subfield('x');
      push @pnotes, $_->subfield('z');
    }
  }
  if (!$lfield) {
    print "WARN No 852b field found in MFHD record $id\n";
    return;
  }
  push @snotes, $lfield->subfield('x');
  push @pnotes, $lfield->subfield('z');

  my $loc = $lfield->as_string('b');
  my $hloc = $loc;
  my $cn = $lfield->as_string('hi');
  my $hcn = $cn;
  my $cnpre = $lfield->as_string('k');
  # my $cnsuf = $lfield->as_string('m');
  my $cntype = $lfield->indicator(1);

  my $f908 = $marc->field('908');
  
  my $cntype_str = '';
  if ($cntype eq '0') {
    $cntype_str = 'Library of Congress classification'; 
  } elsif ($cntype eq '1') {
    $cntype_str = 'Dewey Decimal classification';
  } elsif ($cntype eq '2') {
    $cntype_str = 'National Library of Medicine classification';
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

  $bid = "$prefix$bid";
  my $hrid = "$hprefix$id";
  $marc->field('001')->update($hrid);
  $marc->field('004')->update($bid);
  my $hid = uuid($hrid);
  # my $srs = make_srs($marc, $marc->as_usmarc(), $hid, $hrid, $snap_id, $hid);

  my $out = {};
  my $hr = {};
  my $typestr = $typemap->{$tcode} ;
  my $typeid = $refdata->{holdingsTypes}->{$typestr} || $refdata->{holdingsTypes}->{Serial};
  $hr->{holdingsTypeId} = $typeid;
  $hr->{_version} = $ver;
  $hr->{id} = $hid;
  $hr->{instanceId} = uuid($bid);
  $hr->{hrid} = $hrid;
  $hr->{permanentLocationId} = $tofolio->{locations}->{$loc} || '';
  $hr->{sourceId} = $source_id;
  if (!$hr->{permanentLocationId}) { 
    $hr->{permanentLocationId} = $refdata->{locations}->{'Unmapped location'};
    print "WARN FOLIO location not found for \"$loc\"! ($id)\n";
  }
  $hr->{callNumber} = $cn;
  $hr->{callNumberTypeId} = $refdata->{callNumberTypes}->{$cntype_str} if $cntype_str =~ /\w/;
  $hr->{callNumberPrefix} = $cnpre if $cnpre;
  # $hr->{callNumberSuffix} = $cnsuf if $cnsuf;
  $hr->{discoverySuppress} = ($f908 && $f908->subfield('x') && $f908->subfield('x') eq 'Y') ? JSON::true : JSON::false; 
  
  foreach (@pnotes) {
    my $htype = $refdata->{holdingsNoteTypes}->{Note};
    my $n = {
      note=>$_,
      staffOnly=>JSON::false,
      holdingsNoteTypeId=>$htype
    };
    push @{ $hr->{notes} }, $n;
  }
  foreach (@snotes) {
    my $htype = $refdata->{holdingsNoteTypes}->{Note};
    if (/^[12]\d{13}/) {
      $htype = $refdata->{holdingsNoteTypes}->{'Voyager update date'};
    }
    my $n = {
      note=>$_,
      staffOnly=>JSON::true,
      holdingsNoteTypeId=>$htype
    };
    push @{ $hr->{notes} }, $n;
  }

  foreach ($marc->field('866')) {
    my $text = $_->as_string('a');
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
      # my $pn = $_->as_string('ir');
      my $rel = $_->{_ind2};
      my $relstr = $relations->{$rel} || 'No information provided';
      my $ea = { uri => $u };
      $ea->{linkText} = $lt if $lt;
      # $ea->{publicNote} = $pn if $pn;
      $ea->{relationshipId} = $refdata->{electronicAccessRelationships}->{$relstr};
      push @{ $hr->{electronicAccess} }, $ea;
    }
  }
  my $inum = 0;
  foreach my $item ($marc->field('949')) {
    $inum++;
    my $inumstr = sprintf("$iprefix$id-%02d", $inum);
    my $bc = $item->as_string('i') || '';
    my $vl = $item->as_string('c') || '';
    my $cr = $item->as_string('k') || '';
    my $yc = $item->as_string('d') || '';
    # my $dp = $item->as_string('n') || '';
    my $nop = $item->as_string('m') || '';
    my $mt = $item->as_string('t') || '';
    my $st = $item->as_string('s') || '';
    my $loc = $item->as_string('l') || '';
    # my $tmploc = $item->as_string('h') || '';
    my $cp = $item->as_string('g') || '';
    my $cn = $item->as_string('ab') || '';
    my $ntype = $item->as_string('r') || '';
    # my $circs = $item->as_string('f') || '';

    my $ir = {
      id => uuid($inumstr),
      hrid => $inumstr,
      holdingsRecordId => $hr->{id}
    };
    if ($tofolio->{mtypes}->{$mt}) {
      $ir->{materialTypeId} = $tofolio->{mtypes}->{$mt};
    } else {
      $ir->{materialTypeId} = $refdata->{mtypes}->{Unspecified};
      print "WARN Material Type not found for \"$mt\"!\n";
    }

    $ir->{status}->{name} = $statmap->{$st} || 'Available';
    $ir->{permanentLoanTypeId} = $refdata->{loantypes}->{'Can circulate'};
    if ($bc && !$bcseen->{$bc}) {
      $ir->{barcode} = $bc if ($bc);
      $bcseen->{$bc} = 1;
    } elsif ($bc) {
      print "WARN Duplicate barcode found $bc\n";
    }
    if ($vl && $tcode =~ /[y]/) {
      $ir->{enumeration} = $vl;
    } elsif ($vl) {
      $ir->{volume} = $vl;
    }
    $ir->{chronology} = $cr if ($cr);
    $ir->{yearCaption} = [ $yc ] if ($yc);
    # $ir->{descriptionOfPieces} = $dp if ($dp);
    $ir->{numberOfPieces} = $nop if ($nop);
    $ir->{copyNumber} = $cp if ($cp);
    if ($cn && $cn ne $hcn) {
      $ir->{itemLevelCallNumber} = $cn;
      $ir->{itemLevelCallNumberTypeId} = '95467209-6d7b-468b-94df-0f5d7ad2747d' # LC
    }
    # if ($loc && $loc ne $hloc) {
      # $ir->{permanentLocationId} = $tofolio->{locations}->{$loc} || $refdata->{locations}->{'Unmapped Location'};
    # }
    # if ($tmploc) {
      # $ir->{temporaryLocationId} = $tofolio->{locations}->{$tmploc} || $refdata->{locations}->{'Unmapped Location'};
    # }
    foreach my $nt ($item->subfield('q')) {
      my $n = {
        note => $nt,
        itemNoteTypeId => $refdata->{itemNoteTypes}->{'Voyager free text'},
        staffOnly => JSON::true
      };
      push @{ $ir->{notes} }, $n;
    }
    foreach my $nt ($item->subfield('o')) {
      my $n = {
        note => $nt,
        itemNoteTypeId => $refdata->{itemNoteTypes}->{'Reserve charges'},
        staffOnly => JSON::true
      };
      push @{ $ir->{notes} }, $n;
    }

    if ($st eq 'Damaged') {
      $ir->{itemDamagedStatusId} = '54d1dd76-ea33-4bcb-955b-6b29df4f7930'; # Damaged
    }
    # if ($circs =~ /\d/) {
      # my $n = {
          # note => $circs,
          # itemNoteTypeId => $refdata->{itemNoteTypes}->{'Historical circs'},
          # staffOnly => JSON::true
        # };
        # push @{ $ir->{notes} }, $n; 
    # }
    # $ir->{circulationNotes} = [];
    # if ($no && $ntype eq 'charge') {
      # my $nobj = {
        # id => uuid($no . 'Check out'),
        # note => $no,
        # noteType => 'Check out',
        # staffOnly => JSON::true
      # };
      # push @{ $ir->{circulationNotes} }, $nobj;
    # }
    # if ($no && $ntype eq 'discharge') {
      # my $nobj = {
        # id => uuid($no . 'Check in'),
        # note => $no,
        # noteType => 'Check in',
        # staffOnly => JSON::true
      # };
      # push @{ $ir->{circulationNotes} }, $nobj;
    # }
    
    # my $irstr = $json->pretty->encode($ir);
    push @{ $out->{items} }, $ir;
    # print $irstr . "\n";
    
  }

  $out->{holdings} = $json->encode($hr);
  # $out->{srs} = $json->encode($srs);
  return $out;
}

sub make_notes {
  my $marc = shift;
  my $tag = shift;
  my $subs = shift;
  my $type = shift || 'Note';
  my $staff = shift;
  my $repeat = shift || 0;
  my @notes;
  foreach my $f ($marc->field($tag)) {
    if ($repeat) {
      foreach (split //, $subs) {
        my @sfs = $f->subfield($_);
        foreach my $text (@sfs) { 
          my $n = {};
          $n->{note} = $text;
          $n->{holdingsNoteTypeId} = $refdata->{holdingsNoteTypes}->{$type};
          if ($staff) {
            $n->{staffOnly} = JSON::true;
          } else {
            $n->{staffOnly} = JSON::false;
          }
          push @notes, $n;
        }
      }
    } else {
      my $text = $f->as_string($subs);
      if ($text) { 
        my $n = {};
        $n->{note} = $text;
        $n->{holdingsNoteTypeId} = $refdata->{holdingsNoteTypes}->{$type};
        if ($staff) {
          $n->{staffOnly} = JSON::true;
        } else {
          $n->{staffOnly} = JSON::false;
        }
        push @notes, $n;
      }
    }
  }
  return @notes;
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
