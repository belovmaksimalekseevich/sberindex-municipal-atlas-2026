# Исследования и проверки

Здесь собраны протоколы, таблицы и проверки, на которых основаны выводы [отчёта](report.pdf). Выберите тему, чтобы перейти к результатам и исходным данным.

## Материалы по темам

| Тема | С чего начать |
|---|---|
| Устойчивость типологии | [Численные результаты](evidence_details/S07/002_FACTS.json), [научная проверка](evidence_details/S07/001_REVIEW.json) |
| Выбор числа групп | [Протокол сравнения](evidence_details/S09/001_PROTOCOL.md), [результаты](evidence_details/S09/003_READBACK.json), [цена укрупнения](evidence_details/S09/007_ENDPOINTS.md) |
| Поиск похожих территорий | [Выбранные аналоги](evidence_details/S12/011_NEIGHBORS.json), [ошибки по территориям](evidence_details/S12/006_PER_QUERY.csv), [ошибки по регионам](evidence_details/S12/007_PER_REGION.csv), [общие итоги](evidence/S13.json) |
| Внешние показатели | [Реестр проверок](evidence_details/S15/022_EXTERNAL_VALIDATION.csv), [численные результаты](evidence_details/S15/023_NUMERIC_EVIDENCE.csv) |
| Практические случаи | [Правила выбора](evidence_details/S16/001_PROTOCOL.md), [территории и показатели](evidence_details/S16/003_FACTS.json) |
| Данные атласа | [Проверка источников](evidence_details/S20/001_ROOT_DATA_ACCEPTANCE.json), [сверка выгрузки](evidence_details/S20/002_FRONTEND_DATA_PARITY.json) |

## Проверка файлов и таблиц

Из корня репозитория, с Python 3.11 или новее:

```text
python -B docs/evidence_details/verify_details.py
python -B docs/evidence_details/verify_analogue_tables.py
```

Дополнительные библиотеки не нужны. Первая команда проверяет контрольные суммы источников и доступность ссылок. Вторая сверяет ID аналогов, административные типы, регионы и арифметику опубликованных таблиц. Обе читают сохранённые данные; нового поиска соседей или обучения здесь нет.

Для работы с моделью используйте [инструкцию научного комплекта](../research/README.md) и [полный пересчёт](FULL_REPLAY.md).

<details>
<summary>Все протоколы и таблицы: 63 файла</summary>

### Устойчивость и административная опора

[Обзор исследования](evidence/S07.md).

- [Научная проверка](evidence_details/S07/001_REVIEW.json)
- [Численные результаты](evidence_details/S07/002_FACTS.json)
- [Контроль расчёта](evidence_details/S07/003_FINAL_OPERATIONAL_ACCEPTANCE_R01.json)
- [Проверка завершения](evidence_details/S07/004_FINAL_POSTEXIT_READBACK_R01.json)
- [Проверка выгрузки](evidence_details/S07/005_DOWNLOAD_QA_R01.json)

### Число групп и различия методов

[Обзор исследования](evidence/S09.md).

- [План сравнения](evidence_details/S09/001_PROTOCOL.md)
- [Проверка исходных файлов](evidence_details/S09/002_LOCAL_TRANSFER_VERIFIED.json)
- [Результаты сравнения](evidence_details/S09/003_READBACK.json)
- [Независимая проверка](evidence_details/S09/004_ACTUAL_ACCEPTANCE_r00.json)
- [Аудит результатов](evidence_details/S09/005_AUDIT.json)
- [Проверка выполнения](evidence_details/S09/006_REVIEW.json)
- [Цена укрупнения групп](evidence_details/S09/007_ENDPOINTS.md)

### Поиск аналогов

[Обзор исследования](evidence/S12.md).

- [Протокол](evidence_details/S12/001_PROTOCOL.json)
- [Уточнение протокола](evidence_details/S12/002_AMENDMENT_2.json)
- [Административные типы](evidence_details/S12/003_TYPE_BINDING.json)
- [Сопоставление исторических данных](evidence_details/S12/004_HISTORY_COMPARISON.json)
- [Покрытие](evidence_details/S12/005_COVERAGE.json)
- [Ошибки по территориям](evidence_details/S12/006_PER_QUERY.csv)
- [Ошибки по регионам](evidence_details/S12/007_PER_REGION.csv)
- [Проверка таблиц](evidence_details/S12/008_QA.json)
- [Итоговая проверка](evidence_details/S12/009_FINAL_RECEIPT.json)
- [Контрольные суммы источников](evidence_details/S12/010_SOURCE_HASHES.json)
- [Выбранные аналоги](evidence_details/S12/011_NEIGHBORS.json)

### Внешние показатели и дополнительные гипотезы

[Обзор исследования](evidence/S15.md).

- [Сводное решение](evidence_details/S15/001_CURRENT_RESULT.json)
- [Результаты проверки зарплат](evidence_details/S15/002_RESULT.json)
- [Протокол проверки зарплат](evidence_details/S15/003_protocol.json)
- [Проверка результатов по зарплатам](evidence_details/S15/004_receipt.json)
- [Проверка демографических данных](evidence_details/S15/005_receipt.json)
- [Протокол демографического сопоставления](evidence_details/S15/006_protocol.json)
- [Вывод демографического теста](evidence_details/S15/007_Вывод_демографического_теста.md)
- [Географические результаты](evidence_details/S15/008_results.json)
- [Географический протокол](evidence_details/S15/009_protocol.json)
- [Географическая проверка](evidence_details/S15/010_receipt.json)
- [Дорожная доступность в декабре 2024](evidence_details/S15/011_2024-12.json)
- [Проверка дорожной доступности](evidence_details/S15/012_receipt.json)
- [Результаты оценки уверенности](evidence_details/S15/013_SUMMARY.json)
- [Протокол оценки уверенности](evidence_details/S15/014_PROTOCOL.json)
- [Событийные проверки](evidence_details/S15/015_PRIMARY4.json)
- [Территории и выборки](evidence_details/S15/016_DENOMINATORS_AND_DISTINCT_IDS96.json)
- [Проверка событийных результатов](evidence_details/S15/017_receipt.json)
- [Решение по дополнительным гипотезам](evidence_details/S15/018_DECISION.json)
- [План проверки гипотез](evidence_details/S15/019_REGISTRATION.json)
- [Проверка выполнения расчёта](evidence_details/S15/020_FINAL_ACCEPTANCE.json)
- [Научная проверка гипотез](evidence_details/S15/021_receipt.json)
- [Реестр внешних проверок](evidence_details/S15/022_EXTERNAL_VALIDATION.csv)
- [Численные доказательства](evidence_details/S15/023_NUMERIC_EVIDENCE.csv)
- [Источники показателей](evidence_details/S15/024_SOURCE_INDEX.json)
- [Проверка исходных дорожных данных](evidence_details/S15/025_INPUT_PROOF.json)
- [Проверка оценки уверенности](evidence_details/S15/026_receipt.json)
- [Итоги событийных проверок](evidence_details/S15/027_RESULT.txt)

### Практические случаи

[Обзор исследования](evidence/S16.md).

- [Правила выбора примеров](evidence_details/S16/001_PROTOCOL.md)
- [Дополнительная проверка](evidence_details/S16/002_POST_SELECTION_CHECK.md)
- [Территории и показатели](evidence_details/S16/003_FACTS.json)
- [Код отбора примеров](evidence_details/S16/004_build_cases.py)
- [Проверка результатов](evidence_details/S16/005_QA.json)

### Данные и отображение атласа

[Обзор исследования](evidence/S20.md).

- [Проверка источников атласа](evidence_details/S20/001_ROOT_DATA_ACCEPTANCE.json)
- [Сверка выгрузки](evidence_details/S20/002_FRONTEND_DATA_PARITY.json)
- [Независимая проверка интерфейса](evidence_details/S20/003_FRONTEND_CROSS_REVIEW.md)
- [Сверка научных данных](evidence_details/S20/004_SCIENCE_FRONTEND_REVIEW.md)
- [Проверка отображения](evidence_details/S20/005_ROOT_UI_ACCEPTANCE.json)
- [SSE6 на компьютере](evidence_details/S20/006_desktop-sse6.jpg)
- [SSE6 на телефоне](evidence_details/S20/007_mobile-sse6.jpg)
- [Сеть на компьютере](evidence_details/S20/008_desktop-network.jpg)

</details>

[Полный указатель источников](evidence_details/DETAILS_INDEX.json) сохраняет исходные привязки каждого файла. [Манифест](evidence_details/MANIFEST.json) содержит контрольные суммы. Источники и их авторство сохранены.

## Как читать результаты

Устойчивость SSE6 проверена в июне и декабре 2024 года. Универсальные экономические функции групп, причинность и экономический эффект их применения не установлены. Тест аналогов не подтвердил пользу обязательного отбора внутри кластера.

**AVU нельзя использовать для ранжирования K6 и K10:** абсолютные значения индекса зависят от числа групп. Формулировка «AVU ухудшается» в ранних материалах означает различие значений, а не установленное ухудшение качества.

Полный пересчёт повторяет 504 месячных и 28 контекстных разбиений. Дополнительные исследования из этого указателя имеют отдельные протоколы; они не входят в эту команду. Исторические пути и команды внутри исходных документов относятся к прежнему окружению. Проверки интерфейса и снимки экрана фиксируют состояние на момент их проведения.
