#!/usr/bin/env python3
"""
meshy_assets.py — generate cartoony low-poly GLB models for Vector Run.

Mirrors the proven pipeline in bannerlord_guns/scripts/meshy_ammo.py.
Reads MESHY_API_KEY from env or from the bannerlord_guns/.env file.

Usage:
  python3 meshy_assets.py preview     # submit text-to-3d preview tasks (idempotent)
  python3 meshy_assets.py status      # poll task status, capture model urls
  python3 meshy_assets.py download    # download succeeded GLBs into assets/models/
  python3 meshy_assets.py manifest    # write assets/models/manifest.json for loaded keys
"""

import os, sys, json, time, urllib.request, urllib.error

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
MODELS = os.path.join(ROOT, "assets", "models")
STATE = os.path.join(MODELS, "_meshy_state.json")
API = "https://api.meshy.ai"
T2D = "/v2/text-to-3d"

# key -> (filename, prompt). filename matches GLB_KEYS in src/assets.js
ROSTER = {
    "player": (
        "player_car.glb",
        "a cute low-poly cartoon sports car, sleek getaway car, glossy bright yellow paint, "
        "rounded chunky shapes, clean, single object, neutral background, game asset, toy car style",
    ),
    "sedan": (
        "traffic_sedan.glb",
        "a cute low-poly cartoon sedan car, simple rounded shapes, flat shaded, clean, "
        "single object, neutral background, mobile game asset, toy car style",
    ),
    "hatch": (
        "traffic_hatchback.glb",
        "a cute low-poly cartoon small hatchback car, chunky rounded, flat shaded, clean, "
        "single object, neutral background, mobile game asset, toy car style",
    ),
    "truck": (
        "truck.glb",
        "a cute low-poly cartoon box delivery truck, chunky boxy shape, flat shaded, clean, "
        "single object, neutral background, mobile game asset, toy truck style",
    ),
    "police": (
        "police_cruiser.glb",
        "a cute low-poly cartoon police car, black and white with a red and blue light bar on roof, "
        "chunky rounded, flat shaded, clean, single object, neutral background, mobile game asset",
    ),
    "cone": (
        "cone.glb",
        "a low-poly cartoon orange traffic cone with white stripe, simple, clean, "
        "single object, neutral background, game asset",
    ),
    "barrier": (
        "barrier.glb",
        "a low-poly cartoon road construction barrier, red and white stripes, concrete jersey wall, "
        "clean, single object, neutral background, game asset",
    ),
}


def key():
    k = os.environ.get("MESHY_API_KEY")
    if not k:
        for env in (
            os.path.join(ROOT, ".env"),
            "/home/fivelidz/projects/game_modding/bannerlord_guns/.env",
        ):
            if os.path.exists(env):
                for line in open(env):
                    if line.startswith("MESHY_API_KEY="):
                        k = line.strip().split("=", 1)[1]
                        break
            if k:
                break
    if not k:
        sys.exit("No MESHY_API_KEY found in env or .env files")
    return k


HEAD = {"Authorization": f"Bearer {key()}", "Content-Type": "application/json"}


def req(method, path, body=None):
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(f"{API}{path}", data=data, headers=HEAD, method=method)
    try:
        with urllib.request.urlopen(r, timeout=90) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        print(f"HTTP {e.code} {method} {path}: {e.read().decode()[:300]}")
        return None
    except Exception as e:
        print(f"ERR {method} {path}: {e}")
        return None


def load(p, d):
    if os.path.exists(p):
        try:
            return json.load(open(p))
        except Exception:
            return d
    return d


def save(p, o):
    os.makedirs(os.path.dirname(p), exist_ok=True)
    json.dump(o, open(p, "w"), indent=2)


def cmd_preview():
    st = load(STATE, {"models": {}})
    for k, (fname, prompt) in ROSTER.items():
        m = st["models"].setdefault(k, {})
        if m.get("task_id"):
            print(f"skip {k} (task {m['task_id']})")
            continue
        body = {
            "mode": "preview",
            "prompt": prompt,
            "art_style": "realistic",
            "ai_model": "meshy-5",
            "should_remesh": True,
            "topology": "triangle",
            "target_polycount": 6000,
        }
        res = req("POST", T2D, body)
        if res and "result" in res:
            m.update(task_id=res["result"], file=fname, status="PENDING")
            print(f"PREVIEW {k} -> {res['result']}")
        else:
            print(f"FAIL {k}: {res}")
        save(STATE, st)
        time.sleep(1)
    save(STATE, st)
    print("state saved", STATE)


def cmd_status():
    st = load(STATE, {"models": {}})
    if not st["models"]:
        print("no tasks; run preview first")
        return
    done = 0
    for k, m in st["models"].items():
        tid = m.get("task_id")
        if not tid:
            print(f"{k:10s} no task")
            continue
        d = req("GET", f"{T2D}/{tid}")
        if not d:
            print(f"{k:10s} poll-fail")
            continue
        m["status"] = d.get("status", "?")
        m["progress"] = d.get("progress", 0)
        if d.get("status") == "SUCCEEDED":
            m["glb"] = d.get("model_urls", {}).get("glb")
            done += 1
        print(f"{k:10s} {m['status']:10s} {m.get('progress', 0)}%")
        save(STATE, st)
    save(STATE, st)
    print(f"{done}/{len(st['models'])} succeeded")


def cmd_download():
    st = load(STATE, {"models": {}})
    os.makedirs(MODELS, exist_ok=True)
    got = 0
    for k, m in st["models"].items():
        url = m.get("glb")
        if not url:
            print(f"{k:10s} not ready")
            continue
        out = os.path.join(MODELS, m["file"])
        try:
            urllib.request.urlretrieve(url, out)
            sz = os.path.getsize(out)
            print(f"GOT {k:10s} -> {m['file']} ({sz // 1024} KB)")
            m["downloaded"] = True
            got += 1
        except Exception as e:
            print(f"DL-FAIL {k}: {e}")
        save(STATE, st)
    print(f"downloaded {got}")
    cmd_manifest()


def cmd_manifest():
    st = load(STATE, {"models": {}})
    man = {
        k: m["file"]
        for k, m in st["models"].items()
        if m.get("downloaded") and os.path.exists(os.path.join(MODELS, m["file"]))
    }
    save(os.path.join(MODELS, "manifest.json"), man)
    print("manifest:", man)


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "status"
    {
        "preview": cmd_preview,
        "status": cmd_status,
        "download": cmd_download,
        "manifest": cmd_manifest,
    }.get(cmd, lambda: print(__doc__))()
