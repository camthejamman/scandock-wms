# Postman collection for the ScanDock API

`ScanDock-WMS.postman_collection.json` is a **Postman v2.1 collection** with 74 requests in 10 folders and ~350
assertions. Run top to bottom it is a full regression pass of the API: it signs in, creates its own unique test data
(item, bins, purchase order, sales order, count, user), walks every state machine and checks the ERP round-trip.

`ScanDock-local.postman_environment.json` holds the environment variables (`baseUrl`, `erpUrl`, the demo credentials).

## Use it in the Postman app

1. **File → Import** and drop both JSON files (or the whole `postman/` folder).
2. Pick the **ScanDock local** environment in the top-right selector.
3. Start the stack (`npm run up`) and either send requests one by one or open the collection's **Run** button to run
   everything in order. Collection variables (`token`, `sku`, `poNumber`, `soNumber`, `countId`, …) are filled in by the
   test scripts as the run progresses; the **Tests** tab of every request shows what is asserted.

Every request works stand-alone too: the collection-level pre-request script gives it a `runId`, and the two "Login"
requests store the bearer tokens the collection-level auth uses.

## Run it from the command line (Newman)

```bash
npm run test:postman
```

This runs Newman with the CLI reporter and writes `e2e/junit/postman.xml` (JUnit, importable into Jira/X-ray next to the
Playwright results). It needs the API on `localhost:4000` and the ERP mock on `localhost:4100` (`npm run up`). Point it at
another environment by editing the environment file or passing `--env-var baseUrl=https://…`.

CI runs the same command in the `postman` job of `.github/workflows/ci.yml`.

## It is generated code

The JSON is built by [`scripts/build-postman.ts`](../scripts/build-postman.ts) (`npm run postman:build`). Keeping the
collection as code means readable diffs in pull requests, no hand-editing of JSON, and shared helpers for the assertions.
If you change requests inside the Postman app, port the change back to the script (or export over the file and accept that
the next build overwrites it).

Two Postman rules the script bakes in:

* `{{variables}}` are expanded in URLs, headers and bodies, **not** inside scripts; scripts use `pm.variables.get()`.
  The build fails if a script contains a placeholder.
* State that must survive across requests goes into **collection variables** (`pm.collectionVariables.set`), so the
  environment stays clean and the run is repeatable.

## When to use this and when to use the Playwright API tests

Both hit the same endpoints. They serve different people:

| | Postman / Newman | Playwright `request` tests (`e2e/tests/api`) |
|---|---|---|
| Audience | anyone: PO, support, manual QA, a developer poking at one endpoint | engineers, CI |
| Strength | exploratory and manual testing, sharing examples, environments, quick demos | parallel, isolated, typed, same runner/report as the UI suite, fixtures and factories |
| Data isolation | one sequential run with a `runId` | hundreds of tests in parallel, each with its own data |
| In this repo | 74 requests, ~350 assertions, JUnit via Newman | 124 tests, 8 workers, JUnit + HTML |

In an RF-SMART style team the collection is the shared language with support and product ("here is exactly the call
that reproduces the bug"), the Playwright suite is the regression gate.
