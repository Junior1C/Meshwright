# MCP-сервер (RU)

Meshwright отдаёт весь движок наружу по [Model Context Protocol](https://modelcontextprotocol.io):
ИИ-ассистент или редактор анализируют и чинят сетки напрямую. Это тот же
`engine.service.MeshService`, что под десктопом, — та же проверка ввода, та же страховка, та же отмена.

```bash
run-mcp.bat                 # берёт .venv проекта
python mcp_server.py        # или своё окружение
```

## Claude Desktop

`claude_desktop_config.json`:

```jsonc
{
  "mcpServers": {
    "meshwright": {
      "command": "D:/path/to/Meshwright/.venv/Scripts/python.exe",
      "args": ["D:/path/to/Meshwright/mcp_server.py"]
    }
  }
}
```

## Claude Code

```bash
claude mcp add meshwright -- D:/path/to/Meshwright/.venv/Scripts/python.exe D:/path/to/Meshwright/mcp_server.py
```

Команду указывайте на интерпретатор из `.venv` проекта — сервер получит версии, с которыми ставился Meshwright.

Интерфейс самого приложения — на русском (кнопка EN/РУ); ответы MCP-сервера, журнал и отчёты — на английском, это общий след аудита.

## Инструменты

| Инструмент | Аргументы | Делает |
|---|---|---|
| `load_model` | `path` | Грузит OBJ/FBX/GLB/GLTF/STL/PLY/3MF/DAE/OFF и отдаёт полную диагностику |
| `analyze` | — | Перепроверяет текущую сетку |
| `repair` | `strict_watertight=true`, `force=false` | Стадийный конвейер ремонта, затем проверка |
| `fix_slivers` | `min_angle_deg=1.0`, `force=false` | Схлопнуть иглы, перевернуть крышки |
| `simplify` | `keep_fraction=0.5` , `force=false` | Quadric-децимация долей |
| `retopologize` | `target_faces`, `method="quadriflow"`, `preserve_sharp=true`, `adaptive=true` | Умная ретопология / жёсткое упрощение до абсолютного числа граней |
| `remove_shells` | `indices` | Удалить несвязанные острова по индексу (0 — самый большой) |
| `rotate` | `axis`, `degrees` | Повернуть вокруг центра модели |
| `undo` / `redo` | — | Ходить между номерными состояниями |
| `revert` | — | Назад к файлу как загружен |
| `states` | — | Список состояний сессии |
| `export_stl` | `path`, `scale_unit="mm"`, `align_origin=true` | Пишет готовый к печати бинарный STL |
| `export_report` | `path` | Пишет диагностику + историю в JSON |

`method` для `retopologize`: `quadriflow` (чистые quad-ы по кривизне — лучше для органики и лоу-поли), `isotropic` (ровные треугольники), `quadric` (схлопывание с сохранением топологии, держит жёсткие края).

## Ресурс

`meshwright://report` — текущая диагностика и история операций в JSON.

## Форма результата

Каждый инструмент возвращает JSON. Бинарное превью сетки и карты текстур вырезаются — итог меньше килобайта даже на модели с полным PBR-набором 2048. От блока текстур остаётся, какие каналы есть, а не что в них.

```jsonc
{
  "success": true,
  "state_id": 2,
  "operation": "repair",
  "analysis": {
    "stats": { "face_count": 44962, "is_watertight": true, "body_count": 23, "...": "..." },
    "issues": [ { "id": "slivers", "severity": "info", "title": "Sliver triangles",
                  "detail": "...", "count": 186 } ],
    "score": 94,
    "verdict": "Printable, minor cleanup available"
  },
  "can_undo": true,
  "can_redo": false,
  "log": ["[info] Stage 1: ...", "[ok] State #2 (repair): ..."]
}
```

Массив `log` — тот же пошаговый след, что в консоли десктопа: по нему удобно объяснять пользователю, что реально произошло.

## Безопасность

Разрушительный результат отклоняется, а не применяется:

```jsonc
{
  "success": false,
  "rejected": true,
  "reason": "critical problems would increase from 0 to 2",
  "would_be": { "verdict": "Repair required", "score": 21 },
  "state_id": 1
}
```

`force=true` — применить всё равно: осознанно, никогда случайно. В любом случае ничего не гибнет: `undo` возвращает прошлое состояние, а каждое принятое пишется в снимок на диск.

## Заметки

- Сервер держит одну сессию. Загрузка новой модели сбрасывает историю состояний.
- Пути проверяются: файл должен существовать, иметь поддерживаемое расширение и быть меньше 2 ГБ. Выходные пути — в существующую папку.
- Снимки автосейва живут в `%LOCALAPPDATA%\Meshwright\sessions` и при чистом выходе удаляются.

Оригинал на английском: [MCP.en.md](MCP.en.md).
