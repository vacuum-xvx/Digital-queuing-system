# Task 1 report — источники и ассеты

## Результат

Подготовлены стабильные копии обязательных UI-crops и трёх phone frames в `docs/presentation/assets/`. Генератор `docs/presentation/generate_deck.js` не изменялся. Новые зависимости не добавлялись.

## Файлы изменены/созданы

- `docs/presentation/assets/crops/home_smart_route.png`
- `docs/presentation/assets/crops/smart_route_list.png`
- `docs/presentation/assets/crops/booking_calendar.png`
- `docs/presentation/assets/crops/otp_dialog.png`
- `docs/presentation/assets/crops/my_ticket_ok.png`
- `docs/presentation/assets/crops/tv_board.png`
- `docs/presentation/assets/crops/manager_dashboard.png`
- `docs/presentation/assets/crops/branch_map.png`
- `docs/presentation/assets/frames/calendar_phone.png`
- `docs/presentation/assets/frames/smart_route_phone.png`
- `docs/presentation/assets/frames/ticket_phone.png`
- `.superpowers/sdd/2026-10-05-pitch-deck/task-1-report.md`

Копии взяты из уже существующих исходников соседнего checkout проекта:
`/home/vacuum/Desktop/tsifrovaya-ochered-novogo-pokoleniya/docs/presentation/final-assets/crops/` и
`/home/vacuum/Desktop/tsifrovaya-ochered-novogo-pokoleniya/scratch/pitch-deck/prep/frames/`.
В самом worktree исходные каталоги отсутствовали; поэтому обязательные ассеты были подготовлены минимальным копированием, без обработки изображений.

## Проверенные проектные факты

- `README.md`: календарь `today + 14`, удержание слота `15 минут`, 6-значный OTP, `SKIP LOCKED`, `Idempotency-Key`, Transactional Outbox, 10 сценариев T1–T10, модульный монолит, PostgreSQL 17, React 19, Go 1.25.
- `backend/queue_policy.yaml`: `grace_minutes: 30`, source ranks appointment `0`, qr `1`, live `2`; лимиты ожидания также включают 30 минут для QR/LIVE и сервисов.
- `docs/queue-algorithm.md`: канонический порядок `due_at → effective_source_rank → checkin_at → id`, `SKIP LOCKED`, early window `15`, grace `30`, и оговорки по Outbox/ETA/Haversine.

## Команды и выводы

1. Обязательная проверка crops из brief в worktree:

```text
for f in ...; do test -f "docs/presentation/final-assets/crops/$f" || exit 1; done
```

Результат: exit code `1`, потому что каталог `docs/presentation/final-assets/crops/` отсутствовал в worktree.

2. Проверка исходников в соседнем checkout:

```text
find /home/vacuum/Desktop/tsifrovaya-ochered-novogo-pokoleniya -type f -name '<required>.png'
```

Результат: найдены все 8 обязательных crops.

3. Проверка исходных frames:

```text
python3 - <<'PY'
from PIL import Image
from pathlib import Path
for p in sorted(Path('/home/vacuum/Desktop/tsifrovaya-ochered-novogo-pokoleniya/scratch/pitch-deck/prep/frames').glob('*.png')):
    im = Image.open(p)
    assert im.width > 0 and im.height > 0
    print(p, im.size, im.format)
PY
```

Результат:

```text
calendar_phone.png (726, 1080) PNG
smart_route_phone.png (936, 1080) PNG
ticket_phone.png (847, 1080) PNG
```

4. Проверка подготовленных копий в worktree:

```text
for f in home_smart_route.png smart_route_list.png booking_calendar.png otp_dialog.png my_ticket_ok.png tv_board.png manager_dashboard.png branch_map.png; do test -f "docs/presentation/assets/crops/$f" || exit 1; done
```

Результат: exit code `0`.

```text
python3 - <<'PY'
from PIL import Image
from pathlib import Path
for p in sorted(Path('docs/presentation/assets/frames').glob('*.png')):
    im=Image.open(p); assert im.width>0 and im.height>0
    print(p, im.size)
PY
```

Результат:

```text
docs/presentation/assets/frames/calendar_phone.png (726, 1080)
docs/presentation/assets/frames/smart_route_phone.png (936, 1080)
docs/presentation/assets/frames/ticket_phone.png (847, 1080)
```

5. Проверка зависимости:

```text
python3 -c 'import json; print(json.load(open("docs/presentation/package.json"))["dependencies"])'
```

Результат: `{'pptxgenjs': '^4.0.1'}`. `package-lock.json` подтверждает `pptxgenjs` 4.0.1. Новые зависимости не добавлялись. В worktree `node_modules` отсутствует, поэтому генератор не запускался.

## Git

Изменения Task 1 закоммичены на ветке `feature/pitch-deck-rebuild`.

## Concerns

- Исходные `final-assets/crops` и `scratch/pitch-deck/prep/frames` не были tracked в этом worktree; они доступны в соседнем checkout и скопированы в новый стабильный путь `docs/presentation/assets/`.
- `scratch/` игнорируется `.gitignore`, поэтому подготовленные frames сохранены в tracked-пути `docs/presentation/assets/frames/`.
- Существующие до начала работы untracked-файлы `docs/superpowers/plans/2026-10-05-pitch-deck.md` и `docs/superpowers/specs/2026-10-05-pitch-deck-design.md` не изменялись и не включены в коммит.
- Генератор намеренно не переписывался; его текущий текст содержит неподтверждённую формулировку `Go 1.24` и прежние заявления, но исправление относится к последующей задаче.
