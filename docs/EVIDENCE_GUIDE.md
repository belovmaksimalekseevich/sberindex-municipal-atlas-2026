# Как проверить дополнительные доказательства

## Что это за дополнение

Дополнение подготовлено на основе опубликованной версии `e0ff09aad7505a7442ded904eac73022703997ba`. Оно добавляет доступ к компактным материалам дополнительных исследований и не меняет модели, метки, числа или исходные S01–S22. Исходные тексты сохранены без изменений как исторические снимки; актуальные ссылки приведены ниже.

**Важно:** старые внутренние пути, абсолютные Windows-пути и команды S12 «из этой папки» относятся к историческому рабочему окружению. Они не являются действующей инструкцией для скачанного публичного репозитория. Вложенные исторические скрипты не образуют готовую последовательность запуска. Для чтения результатов и пересчёта основной сетки действует [research/README.md](../research/README.md).

## Две отдельные проверки без обучения

Запустите команды из корня репозитория. Потребуется Python 3.11 или новее; дополнительные библиотеки не нужны:

```text
python -B docs/evidence_details/verify_details.py
python -B docs/evidence_details/verify_analogue_tables.py
```

Первая команда сверяет SHA-256 новых деталей и неизменных S01–S22, затем ссылки именно этой инструкции. Она не исправляет ссылки внутри исторических снимков и не выполняет их команды. Вторая независимо проверяет сохранённые ID соседей, отсутствие самососедей, совпадение административного типа и отличие региона, арифметику предсказаний и ошибок, общие опоры, региональные и общие агрегаты теста аналогов. Она использует только опубликованные таблицы, не повторяет поиск ближайших соседей, оценку нормировки или обучение, не устанавливает независимость исходных данных или экономическую причинность. Квитанции прежних проверок и результаты новых проверок подтверждают разные части работы.

## Привязки источников при обновлении отчёта

Файлы S01–S22 и их SHA-256 сохраняются неизменными. Документ `claim_sources.json` может обновляться вместе с текстом отчёта: дата создания, хеш рукописи и перечень утверждений не фиксируются как неизменные. Проверка сопоставляет только записи источников S01–S22: их относительные публичные пути и SHA-256. Изменение этих привязок или самих файлов источников приведёт к отказу проверки.

## Уточнение AVU (J02)

В историческом S09 и MODEL_DECISION.md встречается формулировка «AVU ухудшается» при сравнении SSE6 с K10. Читать её как ранжирование качества между K6/K10 **нельзя**: абсолютные значения AVU зависят от K и в принятой методологии не используются для выбора числа групп. Корректное чтение: **«Значения AVU различаются между K; эта разность не ранжирует K6/K10»**. Исходные значения и их происхождение сохранены. Эта поправка не меняет решения о роли SSE6, метрик или сохранённых разбиений.

## Что штатный полный пересчёт повторяет и что не повторяет

[Текущая инструкция научного комплекта](../research/README.md) отдельно запускает 504 месячных и 28 годовых контекстных разбиений. Сам `full-fit` не повторяет RC68, дополнительное исследование вариантов K6/K8, исторические альтернативы сходства, внешние проверки, тест скрытой зарплаты, разбор динамики, практические случаи и проверки интерфейса. Их небольшие протоколы, таблицы и квитанции ниже доступны для чтения и проверки конкретных численных выводов. Полная последовательность воспроизведения каждого дополнительного исследования в это дополнение не включена.

Прежний полный контроль выполнен для r03; ядро r04 неизменно, но новый полный r04 не выполнен. Стабильность SSE6 проверена в двух месяцах, не во всех 24 месяцах. Все отрицательные результаты остаются отрицательными. Не установлены универсальные экономические функции, причины изменения расходов, ROI или новая положительная добавка кластерного фильтра.

## Быстрый маршрут по ключевым выводам

- RC68: [численные факты](evidence_details/S07/002_FACTS.json), [независимая научная проверка](evidence_details/S07/001_REVIEW.json).
- K6/K8: [протокол](evidence_details/S09/001_PROTOCOL.md), [прочитанные результаты](evidence_details/S09/003_READBACK.json), [цена укрупнения](evidence_details/S09/007_ENDPOINTS.md).
- Аналоги: [протокол](evidence_details/S12/001_PROTOCOL.json), [выбранные соседи](evidence_details/S12/011_NEIGHBORS.json), [индивидуальные ошибки](evidence_details/S12/006_PER_QUERY.csv), [региональные ошибки](evidence_details/S12/007_PER_REGION.csv), [итоговые опоры и агрегаты](evidence/S13.json).
- Практические случаи: [фиксированные правила](evidence_details/S16/001_PROTOCOL.md), [числа и выбранные территории](evidence_details/S16/003_FACTS.json).
- Внешние проверки: [реестр решений](evidence_details/S15/022_EXTERNAL_VALIDATION.csv), [численные доказательства](evidence_details/S15/023_NUMERIC_EVIDENCE.csv).
- Интерфейс: [приёмка данных](evidence_details/S20/001_ROOT_DATA_ACCEPTANCE.json), [сверка экспорта](evidence_details/S20/002_FRONTEND_DATA_PARITY.json). Это квитанции прежней локальной версии; они не подтверждают текущее состояние опубликованного сайта.

## Полный индекс исходных 75 ссылок

В исходной публикации 75 вхождений неработающих внутренних ссылок. Все их первоисточники найдены в рабочем архиве: 75 из 75. Они указывают на 63 уникальных файла. Ниже приведены актуальные ссылки на каждый из них. Исходные документы и их собственные вложенные ссылки остаются историей. Название существующего JSON-статуса не означает новую приёмку в этом дополнении.

| Источник и строка | Историческая цель | Доступная копия | Размер, байт |
|---|---|---|---:|
| [S07](evidence/S07.md):31 | `scientific_review/actual_r01/REVIEW.json` | [REVIEW.json](evidence_details/S07/001_REVIEW.json) | 118724 |
| [S07](evidence/S07.md):31 | `scientific_review/actual_r01/FACTS.json` | [FACTS.json](evidence_details/S07/002_FACTS.json) | 162053 |
| [S07](evidence/S07.md):31 | `tz_review/FINAL_OPERATIONAL_ACCEPTANCE_R01.json` | [FINAL_OPERATIONAL_ACCEPTANCE_R01.json](evidence_details/S07/003_FINAL_OPERATIONAL_ACCEPTANCE_R01.json) | 483610 |
| [S07](evidence/S07.md):31 | `tz_review/FINAL_POSTEXIT_READBACK_R01.json` | [FINAL_POSTEXIT_READBACK_R01.json](evidence_details/S07/004_FINAL_POSTEXIT_READBACK_R01.json) | 1397 |
| [S07](evidence/S07.md):31 | `DOWNLOAD_QA_R01.json` | [DOWNLOAD_QA_R01.json](evidence_details/S07/005_DOWNLOAD_QA_R01.json) | 407 |
| [S09](evidence/S09.md):55 | `science/PROTOCOL.md` | [PROTOCOL.md](evidence_details/S09/001_PROTOCOL.md) | 11685 |
| [S09](evidence/S09.md):56 | `download_r00/LOCAL_TRANSFER_VERIFIED.json` | [LOCAL_TRANSFER_VERIFIED.json](evidence_details/S09/002_LOCAL_TRANSFER_VERIFIED.json) | 1656 |
| [S09](evidence/S09.md):56 | `readback_r00/READBACK.json` | [READBACK.json](evidence_details/S09/003_READBACK.json) | 24422 |
| [S09](evidence/S09.md):57 | `independent_review/ACTUAL_ACCEPTANCE_r00.json` | [ACTUAL_ACCEPTANCE_r00.json](evidence_details/S09/004_ACTUAL_ACCEPTANCE_r00.json) | 1233096 |
| [S09](evidence/S09.md):58 | `science/actual_r00/AUDIT.json` | [AUDIT.json](evidence_details/S09/005_AUDIT.json) | 1158993 |
| [S09](evidence/S09.md):59 | `engineering/actual_ops_r00/REVIEW.json` | [REVIEW.json](evidence_details/S09/006_REVIEW.json) | 53723 |
| [S09](evidence/S09.md):60 | `science/decision_r00/ENDPOINTS.md` | [ENDPOINTS.md](evidence_details/S09/007_ENDPOINTS.md) | 12376 |
| [S12](evidence/S12.md):5 | `PROTOCOL.json` | [PROTOCOL.json](evidence_details/S12/001_PROTOCOL.json) | 7068 |
| [S12](evidence/S12.md):5 | `../AMENDMENT_2.json` | [AMENDMENT_2.json](evidence_details/S12/002_AMENDMENT_2.json) | 1931 |
| [S12](evidence/S12.md):11 | `TYPE_BINDING.json` | [TYPE_BINDING.json](evidence_details/S12/003_TYPE_BINDING.json) | 606022 |
| [S12](evidence/S12.md):13 | `HISTORY_COMPARISON.json` | [HISTORY_COMPARISON.json](evidence_details/S12/004_HISTORY_COMPARISON.json) | 3072 |
| [S12](evidence/S12.md):38 | `COVERAGE.json` | [COVERAGE.json](evidence_details/S12/005_COVERAGE.json) | 1827 |
| [S12](evidence/S12.md):38 | `PER_QUERY.csv` | [PER_QUERY.csv](evidence_details/S12/006_PER_QUERY.csv) | 2523974 |
| [S12](evidence/S12.md):53 | `PER_REGION.csv` | [PER_REGION.csv](evidence_details/S12/007_PER_REGION.csv) | 141218 |
| [S12](evidence/S12.md):71 | `QA.json` | [QA.json](evidence_details/S12/008_QA.json) | 978 |
| [S12](evidence/S12.md):71 | `FINAL_RECEIPT.json` | [FINAL_RECEIPT.json](evidence_details/S12/009_FINAL_RECEIPT.json) | 2814 |
| [S12](evidence/S12.md):73 | `SOURCE_HASHES.json` | [SOURCE_HASHES.json](evidence_details/S12/010_SOURCE_HASHES.json) | 3196 |
| [S12](evidence/S12.md):73 | `NEIGHBORS.json` | [NEIGHBORS.json](evidence_details/S12/011_NEIGHBORS.json) | 2389417 |
| [S12](evidence/S12.md):73 | `PER_QUERY.csv` | [PER_QUERY.csv](evidence_details/S12/006_PER_QUERY.csv) | 2523974 |
| [S15](evidence/S15.md):3 | `/C:/Users/Максим/Documents/ChatGPT/сберИндекс/workstreams/local_finalization_20261008_r00/CURRENT_RESULT.json` | [CURRENT_RESULT.json](evidence_details/S15/001_CURRENT_RESULT.json) | 7563 |
| [S15](evidence/S15.md):9 | `/C:/Users/Максим/Documents/ChatGPT/сберИндекс/workstreams/external_salary_K10_actual_independent_review_20261008_r00/delivery_r00/RESULT.json` | [RESULT.json](evidence_details/S15/002_RESULT.json) | 5894 |
| [S15](evidence/S15.md):9 | `/C:/Users/Максим/Documents/ChatGPT/сберИндекс/workstreams/external_salary_K10_20261008_r00/package_r02/frozen/protocol.json` | [protocol.json](evidence_details/S15/003_protocol.json) | 18602 |
| [S15](evidence/S15.md):9 | `/C:/Users/Максим/Documents/ChatGPT/сберИндекс/workstreams/external_salary_K10_actual_independent_review_20261008_r00/actual_r00/receipt.json` | [receipt.json](evidence_details/S15/004_receipt.json) | 1598 |
| [S15](evidence/S15.md):11 | `/C:/Users/Максим/Documents/ChatGPT/сберИндекс/workstreams/hypothesis_wave2_external_independent_review_20261008_r00/actual_r00/receipt.json` | [receipt.json](evidence_details/S15/005_receipt.json) | 6077 |
| [S15](evidence/S15.md):11 | `/C:/Users/Максим/Documents/ChatGPT/сберИндекс/workstreams/hypothesis_wave2_external_20261008_r00/package_r00/frozen/protocol.json` | [protocol.json](evidence_details/S15/006_protocol.json) | 7317 |
| [S15](evidence/S15.md):11 | `/C:/Users/Максим/Documents/ChatGPT/сберИндекс/workstreams/hypothesis_wave2_external_independent_review_20261008_r00/actual_r00/Вывод_демографического_теста.md` | [Вывод_демографического_теста.md](evidence_details/S15/007_Вывод_демографического_теста.md) | 6822 |
| [S15](evidence/S15.md):13 | `/C:/Users/Максим/Documents/ChatGPT/сберИндекс/workstreams/geographic_context_delivery_20261007_r00/native_results/results.json` | [results.json](evidence_details/S15/008_results.json) | 2996 |
| [S15](evidence/S15.md):13 | `/C:/Users/Максим/Documents/ChatGPT/сберИндекс/workstreams/geographic_context_delivery_20261007_r00/frozen_inputs/protocol.json` | [protocol.json](evidence_details/S15/009_protocol.json) | 4722 |
| [S15](evidence/S15.md):13 | `/C:/Users/Максим/Documents/ChatGPT/сберИндекс/workstreams/geographic_context_delivery_20261007_r00/independent_review/receipt.json` | [receipt.json](evidence_details/S15/010_receipt.json) | 4706 |
| [S15](evidence/S15.md):13 | `/C:/Users/Максим/Documents/ChatGPT/сберИндекс/workstreams/k10_external_received_20261008_r00/road_extracted_r00/output/result/2024-12.json` | [2024-12.json](evidence_details/S15/011_2024-12.json) | 7373847 |
| [S15](evidence/S15.md):13 | `/C:/Users/Максим/Documents/ChatGPT/сберИндекс/workstreams/k10_road_label_actual_scientific_review_20261008_r00/actual_r00/receipt.json` | [receipt.json](evidence_details/S15/012_receipt.json) | 14550 |
| [S15](evidence/S15.md):15 | `/C:/Users/Максим/Documents/ChatGPT/сберИндекс/workstreams/hypothesis_wave4_confidence_20261008_r00/review/actual_r00/SUMMARY.json` | [SUMMARY.json](evidence_details/S15/013_SUMMARY.json) | 7830 |
| [S15](evidence/S15.md):15 | `/C:/Users/Максим/Documents/ChatGPT/сберИндекс/workstreams/hypothesis_wave4_confidence_20261008_r00/PROTOCOL.json` | [PROTOCOL.json](evidence_details/S15/014_PROTOCOL.json) | 7798 |
| [S15](evidence/S15.md):15 | `/C:/Users/Максим/Documents/ChatGPT/сберИндекс/workstreams/hypothesis_wave2_events_actual_independent_review_20261008_r00/PRIMARY4.json` | [PRIMARY4.json](evidence_details/S15/015_PRIMARY4.json) | 1875 |
| [S15](evidence/S15.md):15 | `/C:/Users/Максим/Documents/ChatGPT/сберИндекс/workstreams/hypothesis_wave2_events_actual_independent_review_20261008_r00/DENOMINATORS_AND_DISTINCT_IDS96.json` | [DENOMINATORS_AND_DISTINCT_IDS96.json](evidence_details/S15/016_DENOMINATORS_AND_DISTINCT_IDS96.json) | 51050 |
| [S15](evidence/S15.md):15 | `/C:/Users/Максим/Documents/ChatGPT/сберИндекс/workstreams/hypothesis_wave2_events_actual_independent_review_20261008_r00/receipt.json` | [receipt.json](evidence_details/S15/017_receipt.json) | 6079 |
| [S15](evidence/S15.md):17 | `/C:/Users/Максим/Documents/ChatGPT/сберИндекс/workstreams/hypothesis_wave5_science_20261008_r00/actual_r00/DECISION.json` | [DECISION.json](evidence_details/S15/018_DECISION.json) | 1324 |
| [S15](evidence/S15.md):17 | `/C:/Users/Максим/Documents/ChatGPT/сберИндекс/workstreams/hypothesis_wave5_campaign_20261008_r00/REGISTRATION.json` | [REGISTRATION.json](evidence_details/S15/019_REGISTRATION.json) | 11056 |
| [S15](evidence/S15.md):17 | `/C:/Users/Максим/Documents/ChatGPT/сберИндекс/workstreams/hypothesis_wave5_campaign_20261008_r00/FINAL_ACCEPTANCE.json` | [FINAL_ACCEPTANCE.json](evidence_details/S15/020_FINAL_ACCEPTANCE.json) | 1139 |
| [S15](evidence/S15.md):17 | `/C:/Users/Максим/Documents/ChatGPT/сберИндекс/workstreams/hypothesis_wave5_science_20261008_r00/actual_r00/receipt.json` | [receipt.json](evidence_details/S15/021_receipt.json) | 6699 |
| [S15](evidence/S15.md):32 | `EXTERNAL_VALIDATION.csv` | [EXTERNAL_VALIDATION.csv](evidence_details/S15/022_EXTERNAL_VALIDATION.csv) | 19296 |
| [S15](evidence/S15.md):32 | `NUMERIC_EVIDENCE.csv` | [NUMERIC_EVIDENCE.csv](evidence_details/S15/023_NUMERIC_EVIDENCE.csv) | 15846 |
| [S15](evidence/S15.md):32 | `SOURCE_INDEX.json` | [SOURCE_INDEX.json](evidence_details/S15/024_SOURCE_INDEX.json) | 7668 |
| [S15](evidence/S15.md):36 | `/C:/Users/Максим/Documents/ChatGPT/сберИндекс/workstreams/k10_road_label_diagnostic_20261008_r00/package/INPUT_PROOF.json` | [INPUT_PROOF.json](evidence_details/S15/025_INPUT_PROOF.json) | 3137 |
| [S15](evidence/S15.md):36 | `/C:/Users/Максим/Documents/ChatGPT/сберИндекс/workstreams/local_finalization_20261008_r00/CURRENT_RESULT.json` | [CURRENT_RESULT.json](evidence_details/S15/001_CURRENT_RESULT.json) | 7563 |
| [S15](evidence/S15.md):42 | `/C:/Users/Максим/Documents/ChatGPT/сберИндекс/workstreams/hypothesis_wave4_confidence_20261008_r00/review/actual_r00/SUMMARY.json` | [SUMMARY.json](evidence_details/S15/013_SUMMARY.json) | 7830 |
| [S15](evidence/S15.md):42 | `/C:/Users/Максим/Documents/ChatGPT/сберИндекс/workstreams/hypothesis_wave4_confidence_20261008_r00/PROTOCOL.json` | [PROTOCOL.json](evidence_details/S15/014_PROTOCOL.json) | 7798 |
| [S15](evidence/S15.md):42 | `/C:/Users/Максим/Documents/ChatGPT/сберИндекс/workstreams/hypothesis_wave4_confidence_20261008_r00/review/actual_r00/receipt.json` | [receipt.json](evidence_details/S15/026_receipt.json) | 3212 |
| [S15](evidence/S15.md):44 | `/C:/Users/Максим/Documents/ChatGPT/сберИндекс/workstreams/hypothesis_wave2_events_actual_independent_review_20261008_r00/PRIMARY4.json` | [PRIMARY4.json](evidence_details/S15/015_PRIMARY4.json) | 1875 |
| [S15](evidence/S15.md):44 | `/C:/Users/Максим/Documents/ChatGPT/сберИндекс/workstreams/hypothesis_wave2_events_actual_independent_review_20261008_r00/DENOMINATORS_AND_DISTINCT_IDS96.json` | [DENOMINATORS_AND_DISTINCT_IDS96.json](evidence_details/S15/016_DENOMINATORS_AND_DISTINCT_IDS96.json) | 51050 |
| [S15](evidence/S15.md):44 | `/C:/Users/Максим/Documents/ChatGPT/сберИндекс/workstreams/hypothesis_wave2_events_actual_independent_review_20261008_r00/RESULT.txt` | [RESULT.txt](evidence_details/S15/027_RESULT.txt) | 6655 |
| [S15](evidence/S15.md):46 | `/C:/Users/Максим/Documents/ChatGPT/сберИндекс/workstreams/hypothesis_wave5_campaign_20261008_r00/FINAL_ACCEPTANCE.json` | [FINAL_ACCEPTANCE.json](evidence_details/S15/020_FINAL_ACCEPTANCE.json) | 1139 |
| [S15](evidence/S15.md):46 | `/C:/Users/Максим/Documents/ChatGPT/сберИндекс/workstreams/hypothesis_wave5_campaign_20261008_r00/REGISTRATION.json` | [REGISTRATION.json](evidence_details/S15/019_REGISTRATION.json) | 11056 |
| [S15](evidence/S15.md):56 | `/C:/Users/Максим/Documents/ChatGPT/сберИндекс/workstreams/hypothesis_wave5_science_20261008_r00/actual_r00/DECISION.json` | [DECISION.json](evidence_details/S15/018_DECISION.json) | 1324 |
| [S15](evidence/S15.md):56 | `/C:/Users/Максим/Documents/ChatGPT/сберИндекс/workstreams/hypothesis_wave5_campaign_20261008_r00/FINAL_ACCEPTANCE.json` | [FINAL_ACCEPTANCE.json](evidence_details/S15/020_FINAL_ACCEPTANCE.json) | 1139 |
| [S15](evidence/S15.md):72 | `NUMERIC_EVIDENCE.csv` | [NUMERIC_EVIDENCE.csv](evidence_details/S15/023_NUMERIC_EVIDENCE.csv) | 15846 |
| [S15](evidence/S15.md):72 | `SOURCE_INDEX.json` | [SOURCE_INDEX.json](evidence_details/S15/024_SOURCE_INDEX.json) | 7668 |
| [S16](evidence/S16.md):5 | `PROTOCOL.md` | [PROTOCOL.md](evidence_details/S16/001_PROTOCOL.md) | 9768 |
| [S16](evidence/S16.md):88 | `POST_SELECTION_CHECK.md` | [POST_SELECTION_CHECK.md](evidence_details/S16/002_POST_SELECTION_CHECK.md) | 1523 |
| [S16](evidence/S16.md):118 | `FACTS.json` | [FACTS.json](evidence_details/S16/003_FACTS.json) | 55262 |
| [S16](evidence/S16.md):118 | `build_cases.py` | [build_cases.py](evidence_details/S16/004_build_cases.py) | 12410 |
| [S16](evidence/S16.md):118 | `QA.json` | [QA.json](evidence_details/S16/005_QA.json) | 2039 |
| [S20](evidence/S20.md):13 | `ROOT_DATA_ACCEPTANCE.json` | [ROOT_DATA_ACCEPTANCE.json](evidence_details/S20/001_ROOT_DATA_ACCEPTANCE.json) | 17115 |
| [S20](evidence/S20.md):13 | `review/FRONTEND_DATA_PARITY.json` | [FRONTEND_DATA_PARITY.json](evidence_details/S20/002_FRONTEND_DATA_PARITY.json) | 41845 |
| [S20](evidence/S20.md):13 | `review/FRONTEND_CROSS_REVIEW.md` | [FRONTEND_CROSS_REVIEW.md](evidence_details/S20/003_FRONTEND_CROSS_REVIEW.md) | 9931 |
| [S20](evidence/S20.md):13 | `review/SCIENCE_FRONTEND_REVIEW.md` | [SCIENCE_FRONTEND_REVIEW.md](evidence_details/S20/004_SCIENCE_FRONTEND_REVIEW.md) | 5517 |
| [S20](evidence/S20.md):13 | `ROOT_UI_ACCEPTANCE.json` | [ROOT_UI_ACCEPTANCE.json](evidence_details/S20/005_ROOT_UI_ACCEPTANCE.json) | 9626 |
| [S20](evidence/S20.md):43 | `review/desktop-sse6.jpg` | [desktop-sse6.jpg](evidence_details/S20/006_desktop-sse6.jpg) | 135614 |
| [S20](evidence/S20.md):43 | `review/mobile-sse6.jpg` | [mobile-sse6.jpg](evidence_details/S20/007_mobile-sse6.jpg) | 74376 |
| [S20](evidence/S20.md):43 | `review/desktop-network.jpg` | [desktop-network.jpg](evidence_details/S20/008_desktop-network.jpg) | 73981 |

## Происхождение, хеши и исключённые материалы

[DETAILS_INDEX.json](evidence_details/DETAILS_INDEX.json) связывает каждую ссылку с исходным полем source.path, исходным относительным путём, размером и SHA-256 копии. [MANIFEST.json](evidence_details/MANIFEST.json) фиксирует весь новый слой и существующие неизменные источники. Копии не редактировались. Сторонние данные сохраняют исходное авторство и условия использования; новая лицензия на них здесь не назначается.

Полные архивы ВМ, большие массивы обучения, SSH-ключи, секреты и крупные двоичные файлы не включены. Три небольших JPG являются прежними снимками интерфейса и не заменяют новую интерактивную проверку. Исторический build_cases.py сохранён для проверки правил выбора примеров. Самостоятельная актуальная команда запуска этого файла здесь не предлагается. Переносимый проверяющий скрипт ничего из этих исторических исходников не импортирует и не исполняет.
