import re, sys

path = 'frontend/src/PochtaDemo.tsx'
lines = open(path, encoding='utf-8').read().splitlines()

# 1. show authMode, currentUser, isAuthModalOpen, activeTab init
for kw in ['authMode', 'currentUser', 'isAuthModalOpen', 'activeTab', 'DEMO_BRANCH']:
    print(f'\n=== {kw} ===')
    for i, l in enumerate(lines):
        if kw in l:
            print(f'{i+1}: {l.rstrip()}')
