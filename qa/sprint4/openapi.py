"""Check local references, route parity and protected responses. Requires PyYAML."""
from pathlib import Path
import re
import yaml

root = Path(__file__).resolve().parents[2]
doc = yaml.safe_load((root/'docs/openapi.yaml').read_text())

def check(value):
    if isinstance(value, dict):
        if '$ref' in value:
            ref = value['$ref']
            assert ref.startswith('#/'), ref
            target = doc
            for part in ref[2:].split('/'):
                target = target[part.replace('~1','/').replace('~0','~')]
        for nested in value.values():
            check(nested)
    elif isinstance(value, list):
        for nested in value:
            check(nested)

check(doc)
source = (root/'backend/internal/httpapi/handlers.go').read_text()
source = source[source.index('func (a *API) RegisterRoutes'):source.index('// Responses DTOs')]
depth, stack, runtime = 0, [], set()
for line in source.splitlines():
    route = re.search(r'r.Route\("([^"]+)"', line)
    prefix = ''.join(item[1] for item in stack)
    if route:
        stack.append((depth+1, route[1]))
    endpoint = re.search(r'r\.(Get|Post|Put|Delete)\("([^"]+)"', line)
    if endpoint:
        runtime.add((endpoint[1].lower(), (prefix+endpoint[2]).removeprefix('/api/v1')))
    code = re.sub(r'"[^"\n]*"', '', line)
    depth += code.count('{')-code.count('}')
    while stack and stack[-1][0] > depth:
        stack.pop()

documented = set()
for path, methods in doc['paths'].items():
    for method, operation in methods.items():
        if method not in ['get','post','put','delete']:
            continue
        documented.add((method,path))
        if path.startswith(('/operator/','/admin/','/terminal/')):
            assert operation.get('security'), (method,path,'security')
            assert {'401','403'} <= operation['responses'].keys(), (method,path,'401/403')
assert runtime == documented, {'undocumented':runtime-documented,'not_runtime':documented-runtime}
eta = doc['components']['schemas']['TicketETA']
assert len(eta['required']) == 10
for field in ['estimatedWaitSeconds','estimatedCallAt','position','referenceWindow']:
    assert eta['properties'][field]['nullable']
print(f'OpenAPI: PASS; {len(runtime)} operations, references, auth and ETA nullability')
