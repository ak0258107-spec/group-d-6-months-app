begin;

-- =====================================================================
-- GK BY PURUSHOTAM SIR — V12.12
-- Exact 5-month target plan (03 Aug 2026–31 Dec 2026)
-- Flexible extra class, timing, carry-forward and class order system.
-- Run this file ONCE in Supabase SQL Editor.
-- Existing Auth, profiles, PDFs, tests, R2 and Turso data are not deleted.
-- =====================================================================

alter table public.daily_targets add column if not exists start_time time;
alter table public.daily_targets add column if not exists end_time time;
alter table public.daily_targets add column if not exists class_status text not null default 'scheduled';
alter table public.daily_targets add column if not exists is_extra_class boolean not null default false;
alter table public.daily_targets add column if not exists carried_from_target_id uuid references public.daily_targets(id) on delete set null;
alter table public.daily_targets add column if not exists class_note text;

alter table public.daily_targets drop constraint if exists daily_targets_class_status_check;
alter table public.daily_targets add constraint daily_targets_class_status_check
check(class_status in ('scheduled','partial','completed','cancelled'));

alter table public.daily_targets drop constraint if exists daily_targets_time_order_check;
alter table public.daily_targets add constraint daily_targets_time_order_check
check(start_time is null or end_time is null or end_time>start_time);

create index if not exists daily_targets_schedule_order_idx on public.daily_targets(schedule_day_id,target_order);
create index if not exists daily_targets_class_status_idx on public.daily_targets(schedule_day_id,class_status,status);

-- Expand the old 125-day roadmap safely to 182 calendar days.
-- Missing rows are cloned from the existing schedule_days row, so unknown required columns remain valid.
do $$
declare
  template_row public.schedule_days;
  payload jsonb;
  n integer;
  batch_uuid uuid:='00000000-0000-0000-0000-000000000001';
begin
  select * into template_row from public.schedule_days where batch_id=batch_uuid order by day_number limit 1;
  if template_row.id is null then raise exception 'Base schedule_days नहीं मिले। पहले complete app का original Supabase setup चलाएँ।'; end if;

  -- Move existing dates temporarily so a possible unique(day_date) constraint cannot clash.
  update public.schedule_days set day_date=date '2099-01-01'+day_number
  where batch_id=batch_uuid and day_number between 1 and 182;

  for n in 1..182 loop
    if not exists(select 1 from public.schedule_days where batch_id=batch_uuid and day_number=n) then
      payload:=to_jsonb(template_row)||jsonb_build_object(
        'id',gen_random_uuid(),
        'batch_id',batch_uuid,
        'day_number',n,
        'day_date',date '2099-01-01'+n,
        'manual_lock',false,
        'manual_unlock',false,
        'title','Day '||n,
        'created_at',now(),
        'updated_at',now()
      );
      execute 'insert into public.schedule_days select (jsonb_populate_record(null::public.schedule_days,$1)).*' using payload;
    end if;
  end loop;
end $$;

-- Day 1 = 03 Aug 2026. Day 182 = 31 Jan 2027 (revision calendar reserved).
update public.schedule_days
set day_date=date '2026-08-03'+(day_number-1),manual_lock=false,manual_unlock=false
where batch_id='00000000-0000-0000-0000-000000000001'
  and day_number between 1 and 182;

update public.schedule_days
set manual_lock=true,manual_unlock=false
where batch_id='00000000-0000-0000-0000-000000000001' and day_number>182;

create temporary table tmp_gs_5month_plan(
  day_number integer not null,
  target_order integer not null,
  subject text not null,
  topic text not null
) on commit drop;

insert into tmp_gs_5month_plan(day_number,target_order,subject,topic) values
(1,1,'हरियाणा GK','हरियाणा का परिचय एवं नामकरण'),
(1,2,'हिंदी','वर्ण एवं वर्णमाला'),
(2,1,'विज्ञान','कोशिका'),
(2,2,'Static GK','भारत के राष्ट्रीय प्रतीक'),
(3,1,'भारतीय इतिहास','प्रागैतिहासिक काल एवं पाषाण युग'),
(3,2,'भारतीय राजव्यवस्था','संविधान निर्माण एवं संविधान सभा'),
(4,1,'भारतीय भूगोल','भारत की भौगोलिक स्थिति, विस्तार, सीमाएँ एवं पड़ोसी देश'),
(4,2,'हरियाणा GK','प्राचीन हरियाणा एवं पुरातात्विक स्थल'),
(5,1,'विज्ञान','ऊतक'),
(5,2,'हिंदी','स्वर एवं व्यंजन'),
(6,1,'करंट अफेयर','करंट अफेयर'),
(7,1,'करंट अफेयर','करंट अफेयर'),
(8,1,'हरियाणा GK','हड़प्पा सभ्यता एवं हरियाणा'),
(8,2,'हिंदी','शब्द-विचार एवं शब्दों का वर्गीकरण'),
(9,1,'विज्ञान','मानव शरीर की मूल संरचना'),
(9,2,'हरियाणा GK','वैदिक काल में हरियाणा'),
(10,1,'भारतीय इतिहास','सिंधु घाटी सभ्यता'),
(10,2,'Static GK','महत्वपूर्ण दिवस एवं तिथियाँ'),
(11,1,'हरियाणा GK','महाभारत एवं हरियाणा'),
(11,2,'भारतीय राजव्यवस्था','संविधान की प्रमुख विशेषताएँ'),
(12,1,'हिंदी','संज्ञा'),
(12,2,'हरियाणा GK','प्राचीन राजवंश एवं हरियाणा'),
(13,1,'करंट अफेयर','करंट अफेयर'),
(14,1,'करंट अफेयर','करंट अफेयर'),
(15,1,'विज्ञान','पाचन तंत्र'),
(15,2,'हरियाणा GK','मध्यकालीन हरियाणा'),
(16,1,'भारतीय भूगोल','भारत के भौतिक प्रदेश'),
(16,2,'हिंदी','सर्वनाम'),
(17,1,'हरियाणा GK','तराइन के युद्ध'),
(17,2,'विज्ञान','श्वसन तंत्र'),
(18,1,'हरियाणा GK','पानीपत के युद्ध'),
(18,2,'Static GK','देश–राजधानी–मुद्रा'),
(19,1,'भारतीय इतिहास','वैदिक काल'),
(19,2,'हरियाणा GK','मुगल काल में हरियाणा'),
(20,1,'करंट अफेयर','करंट अफेयर'),
(21,1,'करंट अफेयर','करंट अफेयर'),
(22,1,'हिंदी','विशेषण'),
(22,2,'विज्ञान','रक्त एवं परिसंचरण तंत्र'),
(23,1,'भारतीय राजव्यवस्था','प्रस्तावना'),
(23,2,'हरियाणा GK','मराठा एवं सिख प्रभाव'),
(24,1,'हरियाणा GK','ब्रिटिश शासन एवं प्रशासनिक परिवर्तन'),
(24,2,'हिंदी','क्रिया'),
(25,1,'विज्ञान','उत्सर्जन तंत्र'),
(25,2,'हरियाणा GK','1857 की क्रांति में हरियाणा'),
(26,1,'भारतीय इतिहास','बौद्ध एवं जैन धर्म'),
(26,2,'Static GK','भारत के प्रमुख संस्थान एवं संगठन'),
(27,1,'करंट अफेयर','करंट अफेयर'),
(28,1,'करंट अफेयर','करंट अफेयर'),
(29,1,'हरियाणा GK','हरियाणा का स्वतंत्रता आंदोलन'),
(29,2,'हिंदी','क्रिया-विशेषण'),
(30,1,'विज्ञान','तंत्रिका तंत्र'),
(30,2,'हरियाणा GK','हरियाणा के स्वतंत्रता सेनानी'),
(31,1,'भारतीय राजव्यवस्था','नागरिकता'),
(31,2,'हरियाणा GK','हरियाणा राज्य गठन का इतिहास'),
(32,1,'हिंदी','अव्यय'),
(32,2,'विज्ञान','अंतःस्रावी तंत्र (हार्मोन)'),
(33,1,'हरियाणा GK','भौगोलिक स्थिति एवं सीमाएँ'),
(33,2,'Static GK','अंतरराष्ट्रीय संगठन'),
(34,1,'करंट अफेयर','करंट अफेयर'),
(35,1,'करंट अफेयर','करंट अफेयर'),
(36,1,'हरियाणा GK','प्रशासनिक विभाजन एवं जिले'),
(36,2,'भारतीय इतिहास','महाजनपद एवं मगध'),
(37,1,'हिंदी','लिंग'),
(37,2,'हरियाणा GK','भौतिक प्रदेश'),
(38,1,'विज्ञान','अस्थि एवं पेशी तंत्र'),
(38,2,'भारतीय राजव्यवस्था','मौलिक अधिकार'),
(39,1,'हरियाणा GK','पर्वत एवं पहाड़ियाँ'),
(39,2,'हिंदी','वचन'),
(40,1,'हरियाणा GK','नदियाँ'),
(40,2,'विज्ञान','मानव प्रजनन तंत्र'),
(41,1,'करंट अफेयर','करंट अफेयर'),
(42,1,'करंट अफेयर','करंट अफेयर'),
(43,1,'भारतीय भूगोल','भारत की अपवाह प्रणाली'),
(43,2,'हरियाणा GK','नहरें एवं सिंचाई परियोजनाएँ'),
(44,1,'भारतीय इतिहास','मौर्य साम्राज्य'),
(44,2,'हरियाणा GK','झीलें एवं जलाशय'),
(45,1,'हिंदी','पुरुष'),
(45,2,'विज्ञान','पोषण, विटामिन एवं खनिज'),
(46,1,'Static GK','पुरस्कार एवं सम्मान'),
(46,2,'हरियाणा GK','मिट्टियाँ'),
(47,1,'भारतीय राजव्यवस्था','राज्य के नीति-निदेशक तत्व'),
(47,2,'हरियाणा GK','जलवायु'),
(48,1,'करंट अफेयर','करंट अफेयर'),
(49,1,'करंट अफेयर','करंट अफेयर'),
(50,1,'हिंदी','कारक'),
(50,2,'विज्ञान','रोग एवं प्रतिरक्षा'),
(51,1,'हरियाणा GK','वन एवं वनस्पति'),
(51,2,'Static GK','पुस्तकें एवं लेखक'),
(52,1,'हरियाणा GK','वन्यजीव एवं अभयारण्य'),
(52,2,'हिंदी','काल'),
(53,1,'हरियाणा GK','राष्ट्रीय उद्यान एवं संरक्षण क्षेत्र'),
(53,2,'विज्ञान','पादपों की संरचना एवं प्रमुख जैविक क्रियाएँ'),
(54,1,'भारतीय इतिहास','गुप्त साम्राज्य'),
(54,2,'हरियाणा GK','कृषि एवं प्रमुख फसलें'),
(55,1,'करंट अफेयर','करंट अफेयर'),
(56,1,'करंट अफेयर','करंट अफेयर'),
(57,1,'भारतीय राजव्यवस्था','मौलिक कर्तव्य'),
(57,2,'हिंदी','उपसर्ग'),
(58,1,'हरियाणा GK','पशुपालन एवं पशुधन'),
(58,2,'विज्ञान','जीवों का वर्गीकरण'),
(59,1,'हरियाणा GK','खनिज संसाधन'),
(59,2,'हिंदी','प्रत्यय'),
(60,1,'भारतीय इतिहास','दक्षिण भारत के प्रमुख राजवंश'),
(60,2,'हरियाणा GK','उद्योग एवं औद्योगिक क्षेत्र'),
(61,1,'विज्ञान','पदार्थ एवं उसकी अवस्थाएँ'),
(61,2,'Static GK','खेल एवं प्रमुख प्रतियोगिताएँ'),
(62,1,'करंट अफेयर','करंट अफेयर'),
(63,1,'करंट अफेयर','करंट अफेयर'),
(64,1,'हरियाणा GK','परिवहन एवं संचार'),
(64,2,'भारतीय राजव्यवस्था','राष्ट्रपति एवं उपराष्ट्रपति'),
(65,1,'हरियाणा GK','हरियाणा की प्रशासनिक संरचना'),
(65,2,'हिंदी','संधि एवं संधि-विच्छेद'),
(66,1,'विज्ञान','तत्व, यौगिक एवं मिश्रण'),
(66,2,'हरियाणा GK','राज्यपाल'),
(67,1,'भारतीय भूगोल','भारत की जलवायु'),
(67,2,'हरियाणा GK','मुख्यमंत्री'),
(68,1,'हिंदी','समास'),
(68,2,'विज्ञान','परमाणु एवं अणु'),
(69,1,'करंट अफेयर','करंट अफेयर'),
(70,1,'करंट अफेयर','करंट अफेयर'),
(71,1,'हरियाणा GK','हरियाणा मंत्रिमंडल'),
(71,2,'Static GK','कला एवं संस्कृति'),
(72,1,'भारतीय इतिहास','दिल्ली सल्तनत'),
(72,2,'हरियाणा GK','हरियाणा विधानसभा'),
(73,1,'हिंदी','तत्सम एवं तद्भव शब्द'),
(73,2,'भारतीय राजव्यवस्था','प्रधानमंत्री एवं मंत्रिपरिषद'),
(74,1,'हरियाणा GK','हरियाणा के लोकसभा एवं राज्यसभा क्षेत्र'),
(74,2,'विज्ञान','परमाणु संरचना'),
(75,1,'हरियाणा GK','पंचायती राज व्यवस्था'),
(75,2,'हिंदी','देशज एवं विदेशी शब्द'),
(76,1,'करंट अफेयर','करंट अफेयर'),
(77,1,'करंट अफेयर','करंट अफेयर'),
(78,1,'हरियाणा GK','स्थानीय स्वशासन'),
(78,2,'विज्ञान','आवर्त सारणी'),
(79,1,'भारतीय इतिहास','भक्ति एवं सूफी आंदोलन'),
(79,2,'Static GK','शास्त्रीय एवं लोक नृत्य'),
(80,1,'हरियाणा GK','हरियाणा के प्रमुख बोर्ड एवं निगम'),
(80,2,'हिंदी','पर्यायवाची शब्द'),
(81,1,'हरियाणा GK','हरियाणा के प्रमुख आयोग'),
(81,2,'भारतीय राजव्यवस्था','संसद'),
(82,1,'विज्ञान','रासायनिक अभिक्रियाएँ'),
(82,2,'हरियाणा GK','हरियाणा की प्रमुख सरकारी योजनाएँ'),
(83,1,'करंट अफेयर','करंट अफेयर'),
(84,1,'करंट अफेयर','करंट अफेयर'),
(85,1,'हिंदी','विलोम शब्द'),
(85,2,'हरियाणा GK','हरियाणा की अर्थव्यवस्था एवं बजट की मूल जानकारी'),
(86,1,'Static GK','संगीत एवं वाद्ययंत्र'),
(86,2,'विज्ञान','अम्ल, क्षार एवं लवण'),
(87,1,'हरियाणा GK','हरियाणा की संस्कृति एवं परंपराएँ'),
(87,2,'भारतीय इतिहास','मुगल साम्राज्य'),
(88,1,'हरियाणा GK','हरियाणा के लोक नृत्य'),
(88,2,'हिंदी','अनेक शब्दों के लिए एक शब्द'),
(89,1,'भारतीय भूगोल','प्राकृतिक संसाधन'),
(89,2,'हरियाणा GK','हरियाणा के लोकगीत एवं लोकसंगीत'),
(90,1,'करंट अफेयर','करंट अफेयर'),
(91,1,'करंट अफेयर','करंट अफेयर'),
(92,1,'विज्ञान','धातु एवं अधातु'),
(92,2,'भारतीय राजव्यवस्था','सर्वोच्च न्यायालय एवं न्यायपालिका'),
(93,1,'हरियाणा GK','हरियाणा के लोक वाद्ययंत्र'),
(93,2,'हिंदी','अनेकार्थी एवं समश्रुत भिन्नार्थक शब्द'),
(94,1,'हरियाणा GK','हरियाणा के प्रमुख मेले'),
(94,2,'विज्ञान','कार्बन एवं उसके यौगिक'),
(95,1,'भारतीय इतिहास','मराठा शक्ति'),
(95,2,'हरियाणा GK','हरियाणा के त्योहार'),
(96,1,'हिंदी','मुहावरे'),
(96,2,'Static GK','भारत के प्रमुख स्मारक एवं ऐतिहासिक स्थल'),
(97,1,'करंट अफेयर','करंट अफेयर'),
(98,1,'करंट अफेयर','करंट अफेयर'),
(99,1,'हरियाणा GK','हरियाणा की वेशभूषा एवं आभूषण'),
(99,2,'विज्ञान','दैनिक जीवन में रसायन विज्ञान'),
(100,1,'हरियाणा GK','हरियाणा का खान-पान'),
(100,2,'भारतीय राजव्यवस्था','राज्यपाल एवं मुख्यमंत्री'),
(101,1,'हिंदी','लोकोक्तियाँ'),
(101,2,'हरियाणा GK','हरियाणा की लोककथाएँ एवं लोकनाट्य'),
(102,1,'विज्ञान','मात्रक एवं मापन'),
(102,2,'हरियाणा GK','हरियाणा के रीति-रिवाज एवं सामाजिक परंपराएँ'),
(103,1,'Static GK','भारत के प्रमुख मेले एवं त्योहार'),
(103,2,'हिंदी','शब्द एवं वर्तनी शुद्धि'),
(104,1,'करंट अफेयर','करंट अफेयर'),
(105,1,'करंट अफेयर','करंट अफेयर'),
(106,1,'भारतीय इतिहास','भारत में यूरोपीय शक्तियों का आगमन एवं ब्रिटिश सत्ता का विस्तार'),
(106,2,'हरियाणा GK','हरियाणा की हस्तकला एवं कला'),
(107,1,'हरियाणा GK','हरियाणवी भाषा एवं बोलियाँ'),
(107,2,'विज्ञान','गति'),
(108,1,'हिंदी','वाक्य एवं वाक्य के भेद'),
(108,2,'हरियाणा GK','हरियाणा के प्रमुख साहित्यकार'),
(109,1,'भारतीय राजव्यवस्था','राज्य विधानमंडल'),
(109,2,'हरियाणा GK','प्रमुख पुस्तकें एवं लेखक'),
(110,1,'विज्ञान','बल एवं न्यूटन के नियम'),
(110,2,'भारतीय इतिहास','1857 का विद्रोह'),
(111,1,'करंट अफेयर','करंट अफेयर'),
(112,1,'करंट अफेयर','करंट अफेयर'),
(113,1,'हिंदी','वाक्य परिवर्तन'),
(113,2,'हरियाणा GK','हरियाणा के कवि एवं रचनाकार'),
(114,1,'Static GK','प्रमुख धार्मिक स्थल'),
(114,2,'हरियाणा GK','पत्र-पत्रिकाएँ एवं साहित्यिक संस्थाएँ'),
(115,1,'भारतीय भूगोल','कृषि'),
(115,2,'विज्ञान','कार्य, ऊर्जा एवं शक्ति'),
(116,1,'हरियाणा GK','हरियाणा का सांग साहित्य एवं प्रमुख सांगी'),
(116,2,'हिंदी','वाच्य'),
(117,1,'भारतीय राजव्यवस्था','पंचायती राज एवं स्थानीय स्वशासन'),
(117,2,'हरियाणा GK','हरियाणा के प्रमुख मंदिर'),
(118,1,'करंट अफेयर','करंट अफेयर'),
(119,1,'करंट अफेयर','करंट अफेयर'),
(120,1,'विज्ञान','गुरुत्वाकर्षण'),
(120,2,'हरियाणा GK','प्रमुख गुरुद्वारे'),
(121,1,'हिंदी','वाक्य शुद्धि'),
(121,2,'Static GK','भारत एवं विश्व के महत्वपूर्ण प्रथम'),
(122,1,'हरियाणा GK','प्रमुख मस्जिद एवं दरगाह'),
(122,2,'भारतीय इतिहास','सामाजिक एवं धार्मिक सुधार आंदोलन'),
(123,1,'हरियाणा GK','प्रमुख तीर्थ स्थल'),
(123,2,'विज्ञान','दाब'),
(124,1,'हिंदी','विराम-चिह्न'),
(124,2,'हरियाणा GK','प्रमुख किले, महल एवं हवेलियाँ'),
(125,1,'करंट अफेयर','करंट अफेयर'),
(126,1,'करंट अफेयर','करंट अफेयर'),
(127,1,'भारतीय राजव्यवस्था','संवैधानिक एवं गैर-संवैधानिक संस्थाएँ'),
(127,2,'हरियाणा GK','प्रमुख स्मारक एवं ऐतिहासिक स्थल'),
(128,1,'विज्ञान','ऊष्मा एवं तापमान'),
(128,2,'हिंदी','रिक्त स्थान पूर्ति'),
(129,1,'भारतीय इतिहास','भारतीय राष्ट्रीय आंदोलन एवं गांधी युग'),
(129,2,'हरियाणा GK','प्रमुख पर्यटन स्थल'),
(130,1,'Static GK','प्रमुख आविष्कार एवं आविष्कारक'),
(130,2,'हरियाणा GK','हरियाणा के विश्वविद्यालय'),
(131,1,'हिंदी','क्रमबद्ध वाक्य एवं अनुच्छेद व्यवस्था'),
(131,2,'विज्ञान','ध्वनि'),
(132,1,'करंट अफेयर','करंट अफेयर'),
(133,1,'करंट अफेयर','करंट अफेयर'),
(134,1,'हरियाणा GK','प्रमुख शिक्षण संस्थान'),
(134,2,'Static GK','महत्वपूर्ण उपनाम एवं प्रसिद्ध व्यक्तित्व'),
(135,1,'हरियाणा GK','प्रमुख अनुसंधान एवं चिकित्सा संस्थान'),
(135,2,'विज्ञान','प्रकाश'),
(136,1,'हिंदी','अपठित गद्यांश एवं भाषा-बोध'),
(136,2,'हरियाणा GK','हरियाणा के महत्वपूर्ण सरकारी एवं राष्ट्रीय संस्थान'),
(137,1,'भारतीय इतिहास','क्रांतिकारी आंदोलन, स्वतंत्रता एवं विभाजन'),
(137,2,'भारतीय राजव्यवस्था','निर्वाचन व्यवस्था एवं निर्वाचन आयोग'),
(138,1,'हरियाणा GK','हरियाणा के प्रमुख खिलाड़ी'),
(138,2,'भारतीय भूगोल','भारतीय अर्थ-भूगोल'),
(139,1,'करंट अफेयर','करंट अफेयर'),
(140,1,'करंट अफेयर','करंट अफेयर'),
(141,1,'हरियाणा GK','खेल पुरस्कार एवं उपलब्धियाँ'),
(141,2,'हिंदी','हिंदी भाषा एवं व्याकरण के विविध प्रश्न'),
(142,1,'विज्ञान','विद्युत'),
(142,2,'हरियाणा GK','हरियाणा की खेल नीति एवं खेल संस्थान'),
(143,1,'हरियाणा GK','हरियाणा के प्रमुख व्यक्तित्व'),
(143,2,'विज्ञान','चुंबकत्व'),
(144,1,'हिंदी','मिश्रित शब्दावली अभ्यास'),
(144,2,'भारतीय इतिहास','गवर्नर-जनरल एवं वायसराय + महत्वपूर्ण ऐतिहासिक तथ्य'),
(145,1,'हरियाणा GK','हरियाणा के राज्य प्रतीक'),
(145,2,'भारतीय राजव्यवस्था','संविधान संशोधन एवं अनुसूचियाँ'),
(146,1,'करंट अफेयर','करंट अफेयर'),
(147,1,'करंट अफेयर','करंट अफेयर'),
(148,1,'हरियाणा GK','हरियाणा में प्रथम'),
(148,2,'हिंदी','मिश्रित शब्द-ज्ञान अभ्यास'),
(149,1,'Static GK','पर्यावरण एवं पारिस्थितिकी की सामान्य जानकारी'),
(149,2,'विज्ञान','आधुनिक भौतिकी एवं दैनिक जीवन में भौतिक विज्ञान'),
(150,1,'हरियाणा GK','जिला-वार महत्वपूर्ण तथ्य'),
(150,2,'पुनरावृत्ति','हरियाणा GK का क्रमवार त्वरित पुनरावर्तन'),
(151,1,'पुनरावृत्ति','भारतीय इतिहास + राजव्यवस्था + भूगोल का त्वरित पुनरावर्तन'),
(151,2,'पुनरावृत्ति','विज्ञान + हिंदी + Static GK का त्वरित पुनरावर्तन');

-- Update existing planned Class 1/Class 2 rows without breaking linked IDs/PDFs.
update public.daily_targets t
set subject=p.subject,
    topic=p.topic,
    status='published',
    is_required=true,
    is_extra_class=false,
    class_status='scheduled'
from tmp_gs_5month_plan p
join public.schedule_days d
  on d.batch_id='00000000-0000-0000-0000-000000000001'
 and d.day_number=p.day_number
where t.schedule_day_id=d.id and t.target_order=p.target_order;

-- Insert only missing planned classes.
insert into public.daily_targets(schedule_day_id,target_order,subject,topic,status,is_required,is_extra_class,class_status)
select d.id,p.target_order,p.subject,p.topic,'published',true,false,'scheduled'
from tmp_gs_5month_plan p
join public.schedule_days d
  on d.batch_id='00000000-0000-0000-0000-000000000001'
 and d.day_number=p.day_number
where not exists(
  select 1 from public.daily_targets t
  where t.schedule_day_id=d.id and t.target_order=p.target_order
);

-- Hide only obsolete old planned rows. User-added Extra Classes remain untouched.
update public.daily_targets t
set status='draft',class_status='cancelled'
from public.schedule_days d
where t.schedule_day_id=d.id
  and d.batch_id='00000000-0000-0000-0000-000000000001'
  and d.day_number between 1 and 151
  and coalesce(t.is_extra_class,false)=false
  and not exists(
    select 1 from tmp_gs_5month_plan p
    where p.day_number=d.day_number and p.target_order=t.target_order
  );

-- January is reserved for revision; no invented topics are published automatically.
update public.daily_targets t
set status='draft',class_status='cancelled'
from public.schedule_days d
where t.schedule_day_id=d.id
  and d.batch_id='00000000-0000-0000-0000-000000000001'
  and d.day_number between 152 and 182
  and coalesce(t.is_extra_class,false)=false;

-- ---------------- Admin security helper ----------------
create or replace function public.v1212_require_admin()
returns void language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is null then raise exception 'Login required'; end if;
  if not exists(select 1 from public.profiles p where p.id=auth.uid() and lower(coalesce(p.role::text,''))='admin') then
    raise exception 'Admin access required';
  end if;
end;$$;

create or replace function public.admin_add_daily_class(
  p_schedule_day_id uuid,p_subject text,p_topic text,
  p_start_time text default null,p_end_time text default null,
  p_class_note text default null,p_is_extra boolean default true
) returns public.daily_targets
language plpgsql security definer set search_path=public as $$
declare new_order integer; rowout public.daily_targets; st time; et time;
begin
  perform public.v1212_require_admin();
  if trim(coalesce(p_subject,''))='' or trim(coalesce(p_topic,''))='' then raise exception 'Subject और Topic जरूरी हैं'; end if;
  st:=nullif(trim(coalesce(p_start_time,'')),'')::time;
  et:=nullif(trim(coalesce(p_end_time,'')),'')::time;
  if st is not null and et is not null and et<=st then raise exception 'End Time, Start Time के बाद होना चाहिए'; end if;
  select coalesce(max(target_order),0)+1 into new_order from public.daily_targets where schedule_day_id=p_schedule_day_id and status='published';
  insert into public.daily_targets(schedule_day_id,target_order,subject,topic,status,is_required,start_time,end_time,class_status,is_extra_class,class_note)
  values(p_schedule_day_id,new_order,trim(p_subject),trim(p_topic),'published',true,st,et,'scheduled',coalesce(p_is_extra,true),nullif(trim(coalesce(p_class_note,'')),''))
  returning * into rowout;
  return rowout;
end;$$;

create or replace function public.admin_update_daily_class(
  p_target_id uuid,p_subject text,p_topic text,
  p_start_time text default null,p_end_time text default null,
  p_class_note text default null,p_class_status text default 'scheduled',
  p_youtube_url text default null
) returns public.daily_targets
language plpgsql security definer set search_path=public as $$
declare rowout public.daily_targets; st time; et time;
begin
  perform public.v1212_require_admin();
  if trim(coalesce(p_subject,''))='' or trim(coalesce(p_topic,''))='' then raise exception 'Subject और Topic जरूरी हैं'; end if;
  if p_class_status not in ('scheduled','partial','completed','cancelled') then raise exception 'Invalid Class Status'; end if;
  st:=nullif(trim(coalesce(p_start_time,'')),'')::time;
  et:=nullif(trim(coalesce(p_end_time,'')),'')::time;
  if st is not null and et is not null and et<=st then raise exception 'End Time, Start Time के बाद होना चाहिए'; end if;
  update public.daily_targets set subject=trim(p_subject),topic=trim(p_topic),start_time=st,end_time=et,
    class_note=nullif(trim(coalesce(p_class_note,'')),''),class_status=p_class_status,
    youtube_url=nullif(trim(coalesce(p_youtube_url,'')),'')
  where id=p_target_id returning * into rowout;
  if rowout.id is null then raise exception 'Class नहीं मिली'; end if;
  return rowout;
end;$$;

create or replace function public.admin_move_daily_class(p_target_id uuid,p_direction integer)
returns boolean language plpgsql security definer set search_path=public as $$
declare cur public.daily_targets; other public.daily_targets; wanted integer; temp_order integer:=1000000;
begin
  perform public.v1212_require_admin();
  if p_direction not in (-1,1) then raise exception 'Direction -1 या 1 होना चाहिए'; end if;
  select * into cur from public.daily_targets where id=p_target_id;
  if cur.id is null then raise exception 'Class नहीं मिली'; end if;
  if p_direction=-1 then
    select * into other from public.daily_targets where schedule_day_id=cur.schedule_day_id and status='published' and target_order<cur.target_order order by target_order desc limit 1;
  else
    select * into other from public.daily_targets where schedule_day_id=cur.schedule_day_id and status='published' and target_order>cur.target_order order by target_order asc limit 1;
  end if;
  if other.id is null then return false; end if;
  temp_order:=1000000+cur.target_order;
  update public.daily_targets set target_order=temp_order where id=cur.id;
  update public.daily_targets set target_order=cur.target_order where id=other.id;
  update public.daily_targets set target_order=other.target_order where id=cur.id;
  return true;
end;$$;

create or replace function public.admin_delete_daily_class(p_target_id uuid)
returns boolean language plpgsql security definer set search_path=public as $$
begin
  perform public.v1212_require_admin();
  update public.study_materials set target_id=null where target_id=p_target_id;
  delete from public.daily_targets where id=p_target_id;
  return found;
end;$$;

create or replace function public.admin_carry_forward_daily_class(
  p_target_id uuid,p_destination_day_id uuid,
  p_start_time text default null,p_end_time text default null
) returns public.daily_targets
language plpgsql security definer set search_path=public as $$
declare src public.daily_targets; new_order integer; rowout public.daily_targets; st time; et time; source_day integer;
begin
  perform public.v1212_require_admin();
  select * into src from public.daily_targets where id=p_target_id;
  if src.id is null then raise exception 'Source Class नहीं मिली'; end if;
  if p_destination_day_id=src.schedule_day_id then raise exception 'Destination Day अलग चुनें'; end if;
  st:=nullif(trim(coalesce(p_start_time,'')),'')::time;et:=nullif(trim(coalesce(p_end_time,'')),'')::time;
  if st is not null and et is not null and et<=st then raise exception 'End Time, Start Time के बाद होना चाहिए'; end if;
  select day_number into source_day from public.schedule_days where id=src.schedule_day_id;
  select coalesce(max(target_order),0)+1 into new_order from public.daily_targets where schedule_day_id=p_destination_day_id and status='published';
  insert into public.daily_targets(schedule_day_id,target_order,subject,topic,status,is_required,start_time,end_time,class_status,is_extra_class,carried_from_target_id,class_note)
  values(p_destination_day_id,new_order,src.subject,src.topic,'published',true,st,et,'scheduled',true,src.id,
    concat('Carry Forward',case when source_day is not null then ' • Day '||source_day else '' end,case when src.class_note is not null then ' • '||src.class_note else '' end))
  returning * into rowout;
  update public.daily_targets set class_status='partial' where id=src.id and class_status='scheduled';
  return rowout;
end;$$;

-- Daily completion ignores cancelled classes and automatically includes Extra Classes.
create or replace function public.refresh_daily_progress(p_user_id uuid,p_schedule_day_id uuid)
returns public.daily_progress language plpgsql security definer set search_path=public as $$
declare tt integer:=0;ct integer:=0;pdf_total integer:=0;pdf_ready integer:=0;pdf_ok boolean:=false;final_test_id uuid;final_pass numeric(5,2):=0;best_final numeric(5,2):=null;started boolean:=false;st public.progress_status;fb public.feedback_code;rowout public.daily_progress;
begin
  if not(p_user_id=auth.uid() or public.is_admin()) then raise exception 'Access denied'; end if;
  select count(*) into tt from public.daily_targets where schedule_day_id=p_schedule_day_id and is_required=true and status='published' and coalesce(class_status,'scheduled')<>'cancelled';
  select count(*) into pdf_total from public.study_materials m join public.daily_targets t on t.id=m.target_id where m.schedule_day_id=p_schedule_day_id and m.status='published' and coalesce(t.class_status,'scheduled')<>'cancelled';
  select count(*) into pdf_ready from public.study_materials m join public.daily_targets t on t.id=m.target_id where m.schedule_day_id=p_schedule_day_id and m.status='published' and coalesce(t.class_status,'scheduled')<>'cancelled' and public.user_can_read_material(p_user_id,m.id);
  pdf_ok:=(pdf_total>=tt and pdf_ready>=pdf_total and tt>0);ct:=case when pdf_ok then tt else 0 end;
  select id,passing_percent into final_test_id,final_pass from public.tests where schedule_day_id=p_schedule_day_id and status='published' and is_final_daily=true order by created_at desc limit 1;
  if final_test_id is not null then select max(percentage) into best_final from public.test_attempts where user_id=p_user_id and test_id=final_test_id and status='submitted'; end if;
  select exists(select 1 from public.pdf_verification_attempts a join public.study_materials m on m.id=a.material_id where a.user_id=p_user_id and m.schedule_day_id=p_schedule_day_id) or best_final is not null into started;
  if not started then st:='not_started';fb:='work_not_started';elsif not pdf_ok then st:='partial';fb:='target_pending';elsif final_test_id is not null and (best_final is null or best_final<coalesce(final_pass,0)) then st:='partial';fb:='test_pending';else st:='completed';if coalesce(best_final,100)>=80 then fb:='excellent';else fb:='very_good';end if;end if;
  insert into public.daily_progress(user_id,schedule_day_id,total_targets,completed_targets,class_verified,pdf_verified,test_submitted,test_score_percent,status,feedback,updated_at)
  values(p_user_id,p_schedule_day_id,tt,ct,false,pdf_ok,best_final is not null,best_final,st,fb,now())
  on conflict(user_id,schedule_day_id) do update set total_targets=excluded.total_targets,completed_targets=excluded.completed_targets,class_verified=false,pdf_verified=excluded.pdf_verified,test_submitted=excluded.test_submitted,test_score_percent=excluded.test_score_percent,status=excluded.status,feedback=excluded.feedback,updated_at=now()
  returning * into rowout;return rowout;
end;$$;

grant execute on function public.admin_add_daily_class(uuid,text,text,text,text,text,boolean) to authenticated;
grant execute on function public.admin_update_daily_class(uuid,text,text,text,text,text,text,text) to authenticated;
grant execute on function public.admin_move_daily_class(uuid,integer) to authenticated;
grant execute on function public.admin_delete_daily_class(uuid) to authenticated;
grant execute on function public.admin_carry_forward_daily_class(uuid,uuid,text,text) to authenticated;
grant execute on function public.refresh_daily_progress(uuid,uuid) to authenticated;

commit;
