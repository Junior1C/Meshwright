# Python API (RU)

Всё, что умеют десктоп и MCP-сервер, — методы `MeshService`.

```python
from engine.service import MeshService

svc = MeshService()                    # автосейв включён по умолчанию
svc.load("miniature.stl")
print(svc.current.analysis["verdict"])  # 'Repair required'

svc.repair()                            # измерено, проверено, отменяется
svc.fix_slivers(min_angle_deg=1.0)
svc.retopo(20000, method="quadriflow")
result = svc.export_model("miniature_print_ready.stl", "stl", scale_unit="mm", align_origin=True)
for warning in result["result"]["warnings"]:
    print(warning)                      # напр. 'not a closed solid - 412 edges are open'

svc.export_report("miniature_report.json")
svc.close()                             # чистит снимки для восстановления после падений
```

Вердикты, предупреждения и журнал — на английском: это общий след аудита для десктопа, MCP и JSON-отчёта. Интерфейс десктопа переводит их на русский сам.

## Конструктор

```python
MeshService(log=None, autosave=True, progress=None)
```

- `log(message, level)` — вызывается на каждом шаге; `level`: `info` / `ok` / `warn` / `error`. Падающий логгер никогда не роняет операцию.
- `autosave` — писать фоновый снимок каждого принятого состояния для восстановления после падений.
- `progress(**event)` — вызывается на старте и финише долгой операции:

  ```python
  {"state": "start", "operation": "retopo", "label": "Smart retopology to 50,000 faces",
   "faces": 1994490, "eta": 92.7, "eta_text": "about 1–3 minutes"}
  {"state": "done",  "operation": "retopo", "label": "...", "elapsed": 88.4}
  ```

  На нём едут прогресс-бар или строка статуса. `engine.service.estimate_seconds(operation, faces)`
  и `describe_duration(seconds)` доступны отдельно, если нужна оценка без запуска.

## Операции

| Метод | Возвращает |
|---|---|
| `load(path)` | Полный итог: анализ, статистика, острова, превью, id состояния |
| `load_demo()` | То же для встроенного тестового объекта — файл не нужен |
| `analyze()` | Свежая диагностика текущей сетки |
| `repair(strict_watertight=True, force=False)` | Итог + `report` с `fixes`, `changes`, `passes` |
| `fix_slivers(min_angle_deg=1.0, force=False)` | Итог + `info` (`before`, `after`, `collapsed`, `flipped`, `skipped`) |
| `simplify(keep_fraction=0.5, force=False)` | Итог + `info`, включая `deviation` |
| `retopo(target_faces, method="quadriflow", preserve_sharp=True, adaptive=True)` | Итог + `info` |
| `remove_shells(indices)` | Итог по оставшейся геометрии |
| `rotate(matrix)` | `stats`, `centre`, `bounds` — без нагрузки геометрией |
| `undo()` / `redo()` / `revert()` | Итог по состоянию, куда приземлились |
| `state_list()` | `[{id, operation, verdict, score, faces}, …]` |
| `export_model(path, export_format="stl", scale_unit="mm", align_origin=True)` | `{"result": {...}}` — формат stl, obj, ply, off, glb, gltf или 3mf |
| `export_stl(path, scale_unit="mm", align_origin=True)` | То же, зафиксировано на STL |
| `report()` / `export_report(path)` | Полный JSON-отчёт |

### Что возвращает экспорт

`result["result"]` описывает записанный файл и отвечает на вопрос, который слайсер задать не может:

| Ключ | |
|---|---|
| `is_solid` | `True`, только если сетка герметична **и** замыкает объём |
| `is_watertight`, `volume_cm3`, `avg_wall_mm` | Замеры за вердиктом |
| `warnings` | Проблемы plain-English — простым английским: не замкнутое тело, нет объёма, стенки тоньше заливки |
| `format`, `filename`, `file_size_mb`, `face_count`, `vertex_count` | Сам файл |
| `dimensions_mm`, `bounds_min`, `bounds_max` | После масштаба единиц и посадки на стол |

Открытая поверхность режется одностеночной скорлупой без заполнения — непустой `warnings` читайте как несостоявшуюся печать. Вывернутые сетки при экспорте правятся.

## Свойства

- `svc.mesh` — текущий `trimesh.Trimesh`
- `svc.current` — текущее состояние (`id`, `mesh`, `analysis`, `operation`, `shells`)
- `svc.shells` — список `trimesh.Trimesh`, когда в модели несколько островов
- `svc.original` — нетронутая копия загруженного файла
- `svc.history` — журнал принятых операций

## Ошибки

```python
from engine.service import ServiceError        # нет загруженной модели, невозможный запрос
from engine.validation import ValidationError  # плохой путь, число, матрица
```

Здесь оба — исключения. Адаптеры десктопа и MCP превращают их в
`{"success": false, "error": "..."}`.

## Страховка

Меняющие вызовы идут через `_commit`: итог отклоняется, если число
**критичных** проблем выросло бы или потерялось бы больше 95% геометрии:

```python
res = svc.repair()
if not res["success"] and res.get("rejected"):
    print(res["reason"])            # 'critical problems would increase from 0 to 2'
    res = svc.repair(force=True)    # применить всё равно, осознанно
```

`simplify` и `retopo` от правила потери геометрии освобождены — ронять грани их работа, — но итог всё равно проверяется, а о новых проблемах пишется в лог.

`fix_slivers` сообщает `skipped`: иголки, которые убирать отказались, — схлопывание или переворот порвали бы поверхность. Горсть упрямых иголок безвредна; дыра — нет.

## Восстановление после падений

```python
for s in MeshService.recoverable_sessions():
    print(s["session"], s["source_file"], s["last"])
svc.recover(session_id)             # возвращает последнее хорошее состояние
MeshService.discard_session(session_id)
```

## Модули пониже

Нужен один алгоритм без машины состояний:

```python
from engine.mesh_analysis import analyze_mesh, compare_analyses
from engine.mesh_repair   import repair_mesh
from engine.mesh_cleanup  import fix_slivers
from engine.mesh_retopo   import retopologize, deviation
from engine.mesh_reducer  import reduce_mesh
from engine.mesh_exporter import export_to_format, solidity_report
from engine.model_loader  import load_model
```

Каждый чист: сетка in, сетка + отчёт out. Ни общего состояния, ни UI.

## Текстуры и вьюпорт

```python
svc.load("dragon.fbx")          # UV и PBR-карты приезжают с моделью
svc.corner_uv                   # (F, 3, 2) UV по углам граней, или None
svc.unwrap_uvs()                # построить раскладку; молча затирать существующую отказывается
svc.unwrap_uvs(force=True)      # ...пока не скажете
svc.get_texture_state()         # что есть: каналы, версия, has_uv — без пикселей
svc.get_texture_maps()          # base64-карты, имеет смысл, только когда версия сдвинулась
svc.get_uv_layout()             # края в UV-пространстве для 2D-вида
svc.export_texture_pack(folder) # все каналы плюс UV-подложка, швы залиты
svc.bake_and_export_glb(path)   # один самодостаточный файл
```

Текстурные координаты живут в массиве по углам граней рядом с сеткой, никогда внутри: геометрия остаётся сваренной, а диагностика меряет настоящее. `_commit()` переносит канал на всё, что возвращает операция, — переиндексацией, если грани только переставились, и перепроекцией на старую поверхность, если геометрия правда изменилась.

```python
svc.preview_max_faces = 900_000     # с этого места вьюпорт рисует упрощённую копию
svc.set_preview_detail(0.5)         # рисовать половину модели
svc.set_preview_detail(1.0)         # рисовать всё
svc.set_preview_detail(None)        # пусть Meshwright решит сам
```

Детализация вьюпорта меняет, что рисуется, и ничего больше: сетка, каждый замер и каждый экспорт всегда идут по всему.

```python
svc.clear()                     # пустое рабочее место: сетка, история, снимок и текстуры
```

Оригинал на английском: [API.en.md](API.en.md).
