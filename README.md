name: validate

on:
  push:
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
      - run: node tests/run_tests.js
      - run: node tools/build_bundle.js
      - run: git diff --exit-code -- dist/Project_GATE_Complete_v1.0.gs
      - run: node --check < dist/Project_GATE_Complete_v1.0.gs
