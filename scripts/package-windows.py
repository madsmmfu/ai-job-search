"""Build a clean source distribution; never copy local runtime/user directories."""
import json
import pathlib
import subprocess
import zipfile
import sys

root = pathlib.Path(__file__).resolve().parent.parent
destination = pathlib.Path(sys.argv[1]).resolve()
# Git inventory includes local source edits but excludes most runtime material.
paths = subprocess.check_output(['git', 'ls-files', '-z', '--cached', '--others', '--exclude-standard'], cwd=root).decode().split('\0')
paths += ['package-lock.json', 'web/package-lock.json']
allowed_dirs = {'web', 'lib', 'utils', 'providers', 'templates', 'fonts', 'modes', 'scripts', 'config', 'windows', 'data-static', 'seeds', 'scaffolder'}
blocked_parts = {'node_modules', '.next', '.git', '.omx', '.career-ops-web', 'tests', 'test-results', 'playwright-report', '__pycache__'}
blocked_files = {'cv.md', 'article-digest.md', 'profile.yml', 'cv-facts.json', 'local-paths.txt', 'plugins.yml', '_profile.md', '_custom.md', 'boss-agent.json'}
files = []
for relative in sorted(set(paths)):
    if not relative:
        continue
    p = pathlib.PurePosixPath(relative)
    if any(part in blocked_parts or part.startswith('.') for part in p.parts):
        continue
    if p.name in blocked_files or p.name.endswith(('.log', '.tsbuildinfo')):
        continue
    if len(p.parts) == 1:
        if p.suffix not in {'.mjs', '.json'} and p.name not in {'LICENSE', 'VERSION', 'DATA_CONTRACT.md'}:
            continue
    elif p.parts[0] not in allowed_dirs:
        continue
    if p.parts[0] == 'config' and '.example.' not in p.name:
        continue
    file = root / relative
    if file.is_symlink() or not file.is_file():
        continue
    files.append((relative, file))
config = {'enabled': False, 'loginRequested': False, 'browserTransport': 'playwright', 'browserMode': 'visible', 'intervalSeconds': 120, 'maxRepliesPerCycle': 2, 'cliPath': 'codex', 'modelMode': 'cli-default', 'scopes': []}
destination.parent.mkdir(parents=True, exist_ok=True)
with zipfile.ZipFile(destination, 'w', zipfile.ZIP_DEFLATED) as archive:
    for relative, file in files:
        archive.write(file, 'AI-Zhipin/' + relative)
    archive.writestr('AI-Zhipin/config/boss-agent.json', json.dumps(config, ensure_ascii=False, indent=2))
    for directory in ['data', 'documents', 'reports', 'output', 'jds', 'interview-prep']:
        archive.writestr('AI-Zhipin/' + directory + '/.gitkeep', '')
    archive.writestr('AI-Zhipin/README-Windows.md', (root / 'windows/README.md').read_text())
with zipfile.ZipFile(destination) as archive:
    names = archive.namelist()
    assert 'AI-Zhipin/package-lock.json' in names and 'AI-Zhipin/web/package-lock.json' in names
    assert not any('/node_modules/' in n or '/.next/' in n or n.endswith('/cv.md') or '/boss-agent-conversations/' in n for n in names)
    for name in names:
        if name.endswith(('.mjs', '.ts', '.tsx', '.json', '.md', '.yml', '.cmd', '.ps1')):
            content = archive.read(name)
print(f'{destination}\n{len(names)} files; {destination.stat().st_size} bytes; privacy inventory passed')
