# Interview prep: QA Engineer II at RF-SMART, using ScanDock as your talking piece

You built a toy WMS *and* its test automation. That is a better story than "I read about Playwright": you can talk
about why tests are shaped the way they are, what broke, and what you would do next. Below: how to tell that story,
the questions each interview round tends to ask, crisp answers, and the vocabulary.

## 1. The 90-second pitch

> "To prepare, I built a small warehouse app that mirrors what RF-SMART does: a handheld scanning UI for receiving,
> picking, shipping, transfers and cycle counts, an admin console, and an ERP mock it syncs with, because in your world
> inventory truth lives in NetSuite. Then I treated it the way I'd treat a real product: a requirements catalogue with 35
> ids, a test plan, ~250 Playwright tests split into API, handheld, console, journeys, accessibility, visual and
> cross-browser smoke, Jasmine and Vitest unit tests, k6 for performance, CI with sharding and a JUnit hand-off for X-ray.
> The suite found three real bugs in my own code, including a race between two ERP syncs, which is exactly the kind of
> thing I'd want to catch before a customer's warehouse does."

Then stop talking and let them pick a thread.

## 2. Addressing the elephant: "You're a developer. Why QA?"

Be direct and positive; never apologise for the dev background and never imply QA is a step down.

* "Six years of shipping code taught me where bugs hide: in boundaries, in state machines, in concurrency, in the gap
  between what the story said and what the API does. QA is where I get to use that full-time."
* "I like the feedback loop. In QA you see every feature, talk to every developer and the PO, and you decide what
  'done' means. That breadth is what I want."
* Concrete proof: point at the API tests ("I test the rule at the cheapest layer first"), the contract tests, and the
  outbox race bug ("a pure UI tester would not have thought to fire two syncs at once").
* If they worry you'll leave for a dev job: "I applied to this role on purpose. I can also help the team by reading
  PRs, writing fixtures and keeping the automation framework healthy, which a lot of QA teams need."

## 3. Round-by-round

**Talent acquisition call:** logistics, salary band, hybrid/on-site (Jacksonville office), why RF-SMART. Know their
tagline, "transform customers and change lives", 3,500+ implementations, NetSuite focus. Ask about team size and the
ratio of manual to automated testing.

**Hiring manager (Sr QA Manager):** your test philosophy, how you plan testing for a feature, how you handle a release
under time pressure, tools (Jira/X-ray, Playwright, Jasmine, Puppeteer), how you work with devs. Bring the test plan.

**QA panel:** hands-on. Expect "write a test for this", "how would you test receiving?", "what's flaky about this
test?", Playwright specifics (see §5), bug report quality, test case design (boundary values, equivalence classes,
state transitions, decision tables). Have the shipping-rules boundary table and the receiving state machine ready.

**Cross-functional panel (scrum master, devs, PO):** collaboration. Definition of Done, refining acceptance criteria,
what you do when a story is ambiguous, how you give bad news ("the build isn't ready"), how you prioritise when you
cannot test everything (risk-based: money paths and integrations first).

**Executive (AVP Product Engineering):** motivation, growth, how QA creates customer value in a warehouse product
(downtime at a customer = trucks waiting), quality metrics you would track, questions about the roadmap.

## 4. Testing a WMS feature: the worked example they will probably ask for

*"How would you test receiving a purchase order on the handheld?"*

1. **Clarify** the acceptance criteria: partial receipts? over-receipt policy? lot/serial? which bins are valid? what does
   the ERP get and when? what if the ERP is down?
2. **Risk ranking:** inventory accuracy and ERP posting are the highest risk (money, downstream picks), then UX of the
   scan flow (operator speed), then cosmetics.
3. **Design cases** (this is ScanDock's `receiving.spec.ts`):
   * happy path: full line, PO → RECEIVED, stock +qty, ledger row, ERP document queued
   * partial → PARTIAL, remaining quantity, finish later
   * boundaries: qty 0, negative, 1.5, remaining, remaining+1 (over-receipt), setting on/off
   * lot-tracked: no lot → 400, lot kept on stock; non-tracked with a lot → ignored
   * bin rules: SHIPPING bin, inactive bin, unknown bin, QUARANTINE allowed
   * line resolution: by line number, by SKU, by barcode, SKU on two lines → ambiguous, mismatch
   * state: RECEIVED/CLOSED PO, unknown PO, concurrent receipts
   * atomicity: one bad line rolls back the good ones
   * UI: the toast says what happened, line progress updates, Done returns to the list, keyboard-wedge Enter works,
     the form keeps the operator's input on error
   * integration: outbox → ERP item receipt with the right lines; ERP down → still 201, delivered later
4. **Automate** the rules at the API layer, the operator flow once or twice in the UI, the whole thing once in a journey.
5. **Exploratory** session on a real device profile: fast double scans, scanner suffix characters, rotating the phone,
   losing Wi-Fi mid-post.

## 5. Playwright questions and tight answers

* **Why Playwright over Selenium/Puppeteer?** Auto-waiting locators, one API for Chromium/Firefox/WebKit, built-in test
  runner with parallelism/sharding/retries, trace viewer, request fixture for API tests, device emulation, network
  mocking. Puppeteer is Chromium-first and has no test runner; Selenium is broader (any language) but slower and flakier.
* **Locator strategy?** `getByRole`/`getByLabel`/`getByText` first (what the user sees and what accessibility needs),
  `getByTestId` for containers; never CSS chains tied to layout. Strict mode protects you from ambiguous locators
  (I hit that with `getByLabel('Role')` matching 12 selects; fixed with `exact: true`).
* **How do you avoid flakiness?** Retrying web-first assertions instead of reading values once; no `waitForTimeout`;
  isolate data per test; serialize tests that touch global state; one retry in CI with trace to diagnose, never as a
  crutch; keep tests independent so sharding is safe.
* **Auth?** A `setup` project logs in once per role and saves `storageState`; tests reuse it (`test.use({ storageState })`),
  so each test starts logged in without a UI login. Login itself is tested separately.
* **Fixtures?** Custom `test.extend` with `api`, `apiAs(role)`, `erp`, `factory`, `loginAs`. Fixtures own setup and
  teardown, so tests read like the scenario.
* **Page objects?** Thin: locators plus a few intention-revealing actions (`receive.receiveLine(code, bin)`); no
  assertions inside them.
* **API tests in Playwright?** `playwright.request.newContext({ baseURL })`, no browser; same runner, same reporting.
  Used for the RBAC matrix, the error contract, and setup/teardown speed.
* **Visual testing?** `toHaveScreenshot` with masks for dynamic data, baselines generated only in the Docker image so
  fonts match; keep the number small, they are expensive to maintain.
* **Accessibility?** `@axe-core/playwright` on each main screen, fail on serious/critical. It found real contrast
  issues on the handheld header buttons.
* **CI?** Docker compose stack per job, `--shard=i/n`, blob reports merged into one HTML + JUnit; artifacts on failure.
* **Trace viewer / debugging?** `--trace on-first-retry`, `npx playwright show-trace`, `--ui` mode, `--debug`, `codegen`
  with a device profile to draft selectors.
* **Mocking?** `page.route()` to simulate API failures in UI-only tests; here I preferred a real ERP mock with chaos
  endpoints because the integration *is* the risk.
* **Tags/annotations?** `{ tag: ['@smoke', '@REQ-009'] }`, `--grep @smoke`; tags drive the traceability matrix.

## 6. Jasmine, Puppeteer, Jest: what to say

* **Jasmine:** BDD-style `describe/it/expect`, built-in spies (`spyOn`, `jasmine.createSpy`), `beforeEach/afterEach`,
  async with promises/`done`, randomized order by default (catches order dependence), custom matchers. ScanDock's API
  unit tests use Jasmine with TypeScript via `tsx`. Vs Jest: Jest bundles a runner, mocking, coverage and snapshots;
  Jasmine is the lighter core that Jest's API descends from. Vs Mocha: Mocha needs an assertion library (Chai).
* **Puppeteer:** Chrome DevTools-protocol automation from the Chrome team; great for scripts (PDF, screenshots,
  crawling), used as a test driver with Jest/Jasmine in many older suites. Playwright came from the same people and
  added cross-browser, auto-wait and a runner. If RF-SMART has legacy Puppeteer suites, the migration path is mechanical:
  `page.waitForSelector` + click → `locator.click()`, `page.$eval` → `locator.evaluate`, etc.

## 7. Jira + X-ray

Entities: **Test** (manual steps or automated, keyed), **Precondition**, **Test Set** (grouping), **Test Plan** (what a
release must pass), **Test Execution** (one run, with per-test status), **Test Run** (one test in one execution).
Automated results arrive by importing JUnit/Cucumber/Xray JSON via the REST API; the test's name or an id tag links
it. Coverage is visible on the requirement (story) issue. Good hygiene: one execution per CI run, environments set on
executions, defects linked from the failed run, flaky tests quarantined with a ticket, not deleted.

## 8. WMS / NetSuite vocabulary (know these cold)

SKU, UPC/EAN/GS1-128, UOM, **bin** and **zone**, **put-away**, **forward-pick vs reserve/bulk**, FIFO/FEFO (expiry), **lot**
and **serial** tracking, **license plate (LPN)**, pallet/case/each, **ASN** (advance ship notice), **PO / item receipt**,
**SO / item fulfillment**, **pick wave / batch / cluster picking**, **short pick / backorder**, pack/cartonization, **BOL**,
**cycle count vs physical count**, **blind count**, **variance / inventory adjustment**, **inventory accuracy %**,
**replenishment / min-max**, **transfer order**, cross-docking, **3PL**, **EDI 850/856/940/945**, RF (radio frequency =
the wireless handheld), keyboard-wedge scanner, ZPL/Zebra, **SuiteApp / SuiteScript / RESTlet / SuiteCloud**
(NetSuite's platform; RF-SMART is a *native* SuiteApp), sandbox vs production accounts, NetSuite release cadence
(two releases a year, phased).

## 9. Questions to ask them

* What does the automation framework look like today, and what would success in my first 90 days be?
* How is QA involved before a story is coded (refinement, acceptance criteria), and how often do QA and devs pair?
* How do you test against NetSuite: sandbox accounts, test data reset, release preview windows?
* Manual vs automated ratio now, and where do you want it? Who owns flaky tests?
* How do you use X-ray: test plans per release, automated imports, coverage reports?
* What does a production incident look like for a warehouse customer, and how does QA learn from it?
* Device lab: real scanners, emulators, which Android versions are supported?

## 10. STAR stories to prepare from your dev years (reframed for QA)

Pick four real ones: (1) a bug you found by reading a boundary condition, (2) a time you pushed back on an ambiguous
story and clarified acceptance criteria, (3) a flaky test or CI pipeline you stabilised, (4) a release decision made
under pressure. Keep each to 2 minutes: situation, what *you* did, measurable result, what you would do differently.

## 11. Demo script (if they let you share a screen, 5 minutes)

1. `npm run up`, open the handheld (`/scan`), receive a PO by scanning (type + Enter).
2. Open the console: inventory shows the stock; ERP page: sync, document Sent.
3. Run `npm run test:e2e:smoke`: ~20 tests green in seconds; open the HTML report; open one trace.
4. Show `docs/TRACEABILITY.md` and the CI workflow with shards and the X-ray hand-off.
5. Show `BUG-REPORTS.md`: the sync race and how the test caught it.
