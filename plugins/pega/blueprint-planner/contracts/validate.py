#!/usr/bin/env python3
"""Structural validator for the Pega Blueprint OpenAPI 3.1 contract files."""
import sys
from pathlib import Path
import yaml

REQUIRED_TOP = {"openapi", "info", "servers", "paths", "components"}
REQUIRED_INFO = {"title", "version", "description"}
REQUIRED_OP = {"responses"}
VALID_METHODS = {"get", "post", "put", "patch", "delete", "options", "head", "trace"}
# Case-insensitive path suffix -> must NOT also appear in a request body schema.
PATH_ONLY_KEYS = {"case_id"}


def load(path: Path) -> dict:
    with open(path) as f:
        return yaml.safe_load(f)


def check(path: Path) -> list[str]:
    errors = []
    doc = load(path)
    missing = REQUIRED_TOP - set(doc)
    if missing:
        errors.append(f"{path.name}: missing top-level keys {sorted(missing)}")
        return errors
    if not isinstance(doc["openapi"], str) or doc["openapi"].split(".")[:2] != ["3", "1"]:
        errors.append(f"{path.name}: openapi must be 3.1 (got {doc['openapi']})")
    if not doc["servers"] or "url" not in doc["servers"][0]:
        errors.append(f"{path.name}: servers[0].url is required (may be a placeholder)")
    if "security" not in doc:
        errors.append(f"{path.name}: top-level security scheme must be declared")
    declared = set(doc.get("components", {}).get("securitySchemes", {}))
    for sec in doc.get("security", []):
        for name in sec:
            if name not in declared:
                errors.append(f"{path.name}: security scheme '{name}' not declared in components.securitySchemes")
    missing_info = REQUIRED_INFO - set(doc["info"])
    if missing_info:
        errors.append(f"{path.name}: info missing {sorted(missing_info)}")
    schemas = doc.get("components", {}).get("schemas", {})
    if "Error" not in schemas:
        errors.append(f"{path.name}: components.schemas.Error is required")
    for p, item in doc["paths"].items():
        for method, op in item.items():
            if method.lower() not in VALID_METHODS:
                continue
            if not REQUIRED_OP <= set(op):
                errors.append(f"{path.name}: {method} {p} missing {REQUIRED_OP - set(op)}")
            for pkey in PATH_ONLY_KEYS:
                if pkey in p.lower() and pkey in str(op.get("requestBody", "")).lower():
                    errors.append(f"{path.name}: {method} {p} repeats {pkey} in requestBody")
    return errors


def main() -> int:
    target = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).parent
    files = sorted(target.glob("*.yaml")) if target.is_dir() else [target]
    n_err = 0
    n_clean = 0
    for f in files:
        errs = check(f)
        if errs:
            n_err += len(errs)
            for e in errs:
                print(f"FAIL  {e}")
        else:
            n_clean += 1
            print(f"OK    {f.name}")
    print(f"\n{n_clean} clean, {n_err} errors" if n_err else "\nAll files valid.")
    return 1 if n_err else 0


if __name__ == "__main__":
    raise SystemExit(main())
