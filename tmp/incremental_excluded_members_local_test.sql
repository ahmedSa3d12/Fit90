-- Adds only the members retained from excluded_members_for_client.xlsx.
-- It does not delete or update existing members, subscriptions, receipts, or leads.
-- Excluded because of duplicate phone in the source file: 15 rows.
-- Intended additional members: 85 rows.
SET NAMES utf8mb4;
SET @target_branch_id := 1;
SET @expected_database := 'fit90_db';

CREATE TEMPORARY TABLE `_fit90_additional_member_import` (
  `legacy_member_id` VARCHAR(30) NOT NULL,
  `name` VARCHAR(200) NOT NULL,
  `phone` VARCHAR(20) NULL,
  `email` VARCHAR(150) NULL,
  `gender` ENUM('male', 'female') NOT NULL,
  `card_number` VARCHAR(30) NULL,
  `date_of_birth` VARCHAR(10) NULL,
  `notes` TEXT NULL,
  PRIMARY KEY (`legacy_member_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `_fit90_additional_member_import` (`legacy_member_id`, `name`, `phone`, `email`, `gender`, `card_number`, `date_of_birth`, `notes`) VALUES
('22262','نور الدين هشام','16174356329',NULL,'male','67885521',NULL,NULL),
('22193','أدهم عبدالله اسامه','447770420730',NULL,'male',NULL,'2009-01-05',NULL),
('22153','معاذ مجاهد فوزي مجاهد','33766765871',NULL,'male','31001068800174','2010-01-06',NULL),
('21840','احمد حسام خالد','663784999',NULL,'male','30211110200477','2002-11-11',NULL),
('20590','مروان سعيد شحاته على فرحات','971582258745',NULL,'male','28806110201079','1988-06-11',NULL),
('20576','ملك وليد علي يسري معاذ','580167259',NULL,'female',NULL,'2011-07-01','+966 58 016 7259 right number /01107208280'),
('20548','معتز نوفل','31648730111',NULL,'male','Nm1****48','1987-12-05',NULL),
('20454','أدهم طه ابوالوفا','5512367917098',NULL,'male',NULL,'2009-12-23','Numer is +5512367917'),
('20453','أدهم طه ابوالوفا','5536791754524',NULL,'male',NULL,'2009-12-23','Numer is +5512367917'),
('20452','مروان طه ابوالوفا','19085149994',NULL,'male',NULL,'2001-11-09',NULL),
('20410','لوجين عادل فكاني','555566625',NULL,'female',NULL,NULL,NULL),
('19369','الحسن علي محمود ابراهيم النقلي','385785676',NULL,'male','31404040203836','2014-04-04','353857856768'),
('19368','الحسين علي محمود ابراهيم النقلي','385138416',NULL,'male','310*********74','2010-05-16','+353851384169 الرقم'),
('19324','Ahmed saad abelhaleem','41176322135',NULL,'male','30410010201738','2004-10-01',NULL),
('19159','يمنى عزت محمد عشري','393520313432','yomna.2013@outlook.it','female',NULL,'2020-04-17',NULL),
('18990','إنريكو بلغرانو','393473790132',NULL,'male',NULL,'1999-12-15',NULL),
('18933','عماد فرج وليم فرج','16176809724',NULL,'male','29201190201834','1992-01-19',NULL),
('18850','رامي محمد فتح الله خليفة','41798431490',NULL,'male','29310258800158','1993-10-24',NULL),
('18846','Mohamed salah','971569966166',NULL,'male',NULL,NULL,NULL),
('18762','Asya kathleen Bell','971525061926',NULL,'female',NULL,'1991-09-30',NULL),
('17873','راشد محمد راشد','596878500',NULL,'male','lr3*********00','1998-12-15',NULL),
('17700','سليم محمد سليم محمد إسماعيل القاضي','568629317',NULL,'male','31202020201452','2012-02-02',NULL),
('16513','محمد ميسر محمد','504825958','mmelybari@gmail.com','male',NULL,NULL,NULL),
('16496','سحيم صالح حمد منيخر الحنتيم','35588447',NULL,'male',NULL,NULL,'970097455884447'),
('16487','يوسف تامر حجازى','19177504636',NULL,'male',NULL,'2003-05-18',NULL),
('11032','فيكتوريا سيربو','36060848',NULL,'female',NULL,NULL,'Her Phone:01022685245\nID:755008861'),
('10985','مير كرمات على','16265337168',NULL,'male',NULL,'1959-09-06','رخصة قيادة : a9572456'),
('9506','رزان محمد دلال','19735808625',NULL,'female','a43*********00',NULL,NULL),
('9404','جنه احمد صابر عطيه محمد','13474589081',NULL,'female','30011300200466','2000-11-30',NULL),
('8750','السيد محمود محمد مرسال عماره','30097126',NULL,'male','28702160200855','1987-02-16',NULL),
('7267','سلمان حامد فارس شخير سلمان الضفيري','552555530',NULL,'male','10303061200477','2003-06-12','no need'),
('2587','mohamed aly mohamed almotary','569133811',NULL,'male',NULL,NULL,NULL),
('2535','ABEL ELKARIM AMAAR','597154015',NULL,'male',NULL,NULL,NULL),
('2372','mohamed faisl','99461628',NULL,'male',NULL,NULL,NULL),
('2337','Hussein abdel hamed elshemeri','90098256',NULL,'male',NULL,NULL,NULL),
('2328','عضوية لاغيه','212',NULL,'female',NULL,NULL,NULL),
('2277','valeri','79183511999',NULL,'male',NULL,'1993-11-12',NULL),
('2267','Sultan Fayez','120885898',NULL,'male',NULL,NULL,NULL),
('2266','Soud Matar Elshemry','96590943426',NULL,'male',NULL,'1998-05-04',NULL),
('2264','soud hamad','122738760',NULL,'male',NULL,NULL,NULL),
('2245','Selman Faisel','96599932402',NULL,'male',NULL,NULL,NULL),
('2227','Salman Hamed','112240809',NULL,'male',NULL,'2003-06-12',NULL),
('2206','saad faisal','96555021293',NULL,'male',NULL,'2002-12-16',NULL),
('2205','Saad Al Hagraf motlak','96996694946',NULL,'male',NULL,'2003-09-20',NULL),
('2171','pavel','12250444498',NULL,'male',NULL,NULL,NULL),
('2168','Osama Mohamed El mutairi','96597916368',NULL,'male',NULL,NULL,NULL),
('2167','osama mohamed Alsulaili','0965/66961949',NULL,'male',NULL,NULL,NULL),
('2144','Nour Mohamed','2205228050',NULL,'female',NULL,NULL,NULL),
('2089','mohamed soliman','25',NULL,'male',NULL,NULL,NULL),
('2067','Mohamed nayef alhagraf','96560785858',NULL,'male',NULL,'2003-06-24',NULL),
('2062','Mohamed Mosaad','12001755699',NULL,'male',NULL,'1993-11-12',NULL),
('2049','Mohamed Ibrahim','128568205',NULL,'male',NULL,'1982-10-01',NULL),
('2047','Mohamed Hussein Elhamady','550688827',NULL,'male',NULL,NULL,NULL),
('2033','mohamed farhan','96551388880',NULL,'male',NULL,NULL,NULL),
('2031','Mohamed elshawahdy','11210033318',NULL,'male',NULL,'1987-07-02',NULL),
('2019','mohamed badaah','96555353512',NULL,'male',NULL,'2004-03-28',NULL),
('2017','Mohamed Awad Elharbey','96555952849',NULL,'male',NULL,NULL,NULL),
('2015','mohamed ashraf fadaly','11143666550',NULL,'male',NULL,NULL,NULL),
('1996','Mohamed Abd El Ghafour Omar','79674701486',NULL,'male',NULL,'2003-08-06',NULL),
('1911','khaled fayez saad','96598896340',NULL,'male',NULL,NULL,NULL),
('1910','Khaled Fares','96560090217',NULL,'male',NULL,'2004-05-16',NULL),
('1881','Hussain Khaled Hussain','307',NULL,'male',NULL,'2003-02-22',NULL),
('1840','hamad younes badr','96596615892',NULL,'male',NULL,'2024-01-10',NULL),
('1822','Gamal basiony','155238337',NULL,'male',NULL,NULL,NULL),
('1799','faelh khalid','96550706737',NULL,'male',NULL,'2003-06-19',NULL),
('1776','Emad Elshaeer',NULL,NULL,'male',NULL,NULL,'هاتف المصدر: 01001783680/01040722103'),
('1769','Edne Leonel','25884386780',NULL,'male',NULL,NULL,NULL),
('1748','badr khaled','96566344144',NULL,'male',NULL,NULL,NULL),
('1746','Aziz Al Anzy','96598898128',NULL,'male',NULL,'2005-06-01',NULL),
('1735','Asser Ali Hassan','110018846',NULL,'male',NULL,NULL,NULL),
('1727','Anas Jalil','588',NULL,'male',NULL,'2004-01-28',NULL),
('1716','Amir Wfdi','122327001',NULL,'male',NULL,NULL,NULL),
('1703','ali khaled aldihany','96556661163',NULL,'male',NULL,'2002-06-27',NULL),
('1698','ali farahat ali','0.041666666667',NULL,'male',NULL,'1979-05-18',NULL),
('1687','Ahmed youssry','114',NULL,'male',NULL,NULL,NULL),
('1685','Ahmed tarek gheith','96566933783',NULL,'male',NULL,'2000-12-12',NULL),
('1646','Ahmed Hamouda','10091982993',NULL,'male',NULL,'1992-11-09',NULL),
('1630','ahmed alli mohamed','122387094',NULL,'male',NULL,'1988-01-01',NULL),
('1622','ahmed abdel rahman elammar','96566030180',NULL,'male',NULL,NULL,NULL),
('1604','abdullah ahmed elazmi','122990344',NULL,'male',NULL,NULL,NULL),
('1588','abdellatif saleh','849',NULL,'male',NULL,NULL,NULL),
('1578','abdel rahman housen malik','11243041866',NULL,'male',NULL,'2002-01-16',NULL),
('1569','Abdallah Alaa Soliman','122867666',NULL,'male',NULL,NULL,NULL),
('1552','Aaref Khalifa Mohamed','120390888',NULL,'male',NULL,'1972-05-09',NULL),
('1551','0','574',NULL,'male',NULL,NULL,NULL);

SELECT (BINARY DATABASE() = BINARY @expected_database) INTO @database_ok;
SELECT EXISTS(
  SELECT 1 FROM `tbl_branches`
  WHERE `branch_id` = @target_branch_id
    AND BINARY LOWER(TRIM(`branch_name`)) = BINARY 'fit90'
) INTO @branch_ok;
SET @is_safe := @database_ok AND @branch_ok;
SELECT @is_safe AS `precheck_passed`, @database_ok AS `database_ok`, @branch_ok AS `branch_ok`;

START TRANSACTION;

-- An already-imported member code or phone is skipped. Existing data is never overwritten.
INSERT INTO `club_members` (
  `member_code`, `name`, `phone`, `email`, `gender`, `card_number`, `date_of_birth`, `notes`,
  `branch_id`, `is_active`, `is_deleted`, `created_at`, `updated_at`
)
SELECT
  CONCAT('MIG-', `i`.`legacy_member_id`), `i`.`name`, `i`.`phone`, `i`.`email`, `i`.`gender`,
  `i`.`card_number`, `i`.`date_of_birth`, `i`.`notes`, @target_branch_id, 1, 0, NOW(3), NOW(3)
FROM `_fit90_additional_member_import` `i`
LEFT JOIN `club_members` `by_code`
  ON BINARY `by_code`.`member_code` = BINARY CONCAT('MIG-', `i`.`legacy_member_id`)
LEFT JOIN `club_members` `by_phone`
  ON `i`.`phone` IS NOT NULL AND BINARY `by_phone`.`phone` = BINARY `i`.`phone`
WHERE @is_safe = 1 AND `by_code`.`id` IS NULL AND `by_phone`.`id` IS NULL;

SELECT ROW_COUNT() AS `additional_members_inserted`;
ROLLBACK;

SELECT
  85 AS `source_rows_requested`,
  15 AS `duplicate_phone_rows_excluded`,
  (SELECT COUNT(*) FROM `club_members` WHERE `branch_id` = @target_branch_id AND `member_code` LIKE 'MIG-%') AS `total_migrated_members_after_run`;

DROP TEMPORARY TABLE `_fit90_additional_member_import`;
