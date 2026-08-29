from __future__ import annotations

import argparse
import gzip
import hashlib
import io
import subprocess
import tarfile
from pathlib import Path

EVAL_ROOT = Path(__file__).resolve().parents[1]
REPOSITORY_ROOT = EVAL_ROOT.parents[1]
CC_CHECK_ROOT = REPOSITORY_ROOT / "cc-check"
DEFAULT_OUTPUT = EVAL_ROOT / "artifacts" / "cc-check.tar.gz"
PACKAGE_FILES = ("package.json", "package-lock.json")


def _archive_paths() -> list[Path]:
    paths = [CC_CHECK_ROOT / name for name in PACKAGE_FILES]
    paths.extend(sorted(path for path in (CC_CHECK_ROOT / "dist").rglob("*") if path.is_file()))
    missing = [path for path in paths if not path.is_file()]
    if missing:
        raise FileNotFoundError(f"cc-check bundle inputs are missing: {missing}")
    return paths


def _tar_bytes(paths: list[Path]) -> bytes:
    buffer = io.BytesIO()
    with tarfile.open(fileobj=buffer, mode="w", format=tarfile.PAX_FORMAT) as archive:
        directories = {path.parent for path in paths if path.parent != CC_CHECK_ROOT}
        for directory in sorted(directories):
            info = tarfile.TarInfo(directory.relative_to(CC_CHECK_ROOT).as_posix())
            info.type = tarfile.DIRTYPE
            info.mode = 0o755
            info.uid = 0
            info.gid = 0
            info.uname = "root"
            info.gname = "root"
            info.mtime = 0
            archive.addfile(info)

        for path in paths:
            relative_path = path.relative_to(CC_CHECK_ROOT).as_posix()
            payload = path.read_bytes()
            info = tarfile.TarInfo(relative_path)
            info.size = len(payload)
            info.mode = 0o755 if relative_path == "dist/cc-check.js" else 0o644
            info.uid = 0
            info.gid = 0
            info.uname = "root"
            info.gname = "root"
            info.mtime = 0
            archive.addfile(info, io.BytesIO(payload))
    return buffer.getvalue()


def build_bundle(output: Path, *, install_dependencies: bool = True) -> str:
    if install_dependencies:
        subprocess.run(["npm", "ci"], cwd=CC_CHECK_ROOT, check=True)
    subprocess.run(["npm", "run", "build"], cwd=CC_CHECK_ROOT, check=True)

    output.parent.mkdir(parents=True, exist_ok=True)
    temporary_output = output.with_suffix(f"{output.suffix}.tmp")
    with (
        temporary_output.open("wb") as raw_output,
        gzip.GzipFile(filename="", mode="wb", fileobj=raw_output, mtime=0) as compressed,
    ):
        compressed.write(_tar_bytes(_archive_paths()))
    temporary_output.replace(output)

    digest = hashlib.sha256(output.read_bytes()).hexdigest()
    return f"sha256:{digest}"


def main() -> None:
    parser = argparse.ArgumentParser(description="Build the deterministic cc-check eval bundle.")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument(
        "--skip-install",
        action="store_true",
        help="Reuse the current node_modules instead of running npm ci.",
    )
    arguments = parser.parse_args()
    print(build_bundle(arguments.output.resolve(), install_dependencies=not arguments.skip_install))


if __name__ == "__main__":
    main()
