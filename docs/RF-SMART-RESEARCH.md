# What RF-SMART does (research notes, Nov 2026)

Collected from rfsmart.com, the RF-SMART NetSuite FAQ guide (PDF), press releases and job postings. The point of
these notes is to build a toy that rhymes with the real product and to walk into an interview knowing the vocabulary.

## The company

* **ICS / RF-SMART**, Jacksonville FL, founded 1982 (Jorge Morales, chairman; Michael Morales, CEO). 201–500 employees,
  team members in 7+ countries, customers in 30+ countries. Inc. 5000, "Top Minority-Owned Business", "Healthiest Employer".
* Tagline: *"Your Supply Chain: Mobile. Accurate. Real-time."* Marketing numbers on the home page: **3,500+ implementations,
  40% productivity gains, 99.9% inventory accuracy**.
* Values: "Crazy for our customers", "Easy to do business with", "We have your back", "We fire bullets before cannonballs"
  (iterate small before committing big: a very QA-friendly value to quote), "Ever-expanding impact", belonging.
* Mission statement they use everywhere: *"We exist to transform our customers and change lives."*
* Indeed interview data: difficulty "hard", experience "excellent", process ≈ a month. The posting you have lists five
  rounds (talent acquisition → Sr QA Manager → QA panel → cross-functional panel with scrum master/devs/PO → AVP of
  Product Engineering).

## The product

A **mobile inventory / warehouse management system that lives inside the customer's ERP**:

| ERP | RF-SMART product line |
|---|---|
| Oracle NetSuite | "RF-SMART for NetSuite", a **Native Built-for-NetSuite SuiteApp** (runs inside the NetSuite account; "every scan updates NetSuite in real time", "no servers between the worker and NetSuite"); the biggest line, 2,000+ NetSuite customers |
| Oracle Cloud SCM | commercial and healthcare editions |
| JD Edwards EnterpriseOne | the original line |
| Microsoft Dynamics AX / 365 | |

Workflows named on the site and FAQ: **receiving, put-away, picking (wave/batch, "Advanced Picking", picking strategies),
packing, shipping (RF-SMART Shipping: rules engine, consolidation, cartonization, batch shipping, parcel + LTL), cycle
counting and full physical counting, replenishment, bin transfers, license plating (LPN), work orders / manufacturing
(work-center reporting), kitting, labelling and cloud printing (SummitIT), mobile dimensioning, automation (AMR, ASRS)**.
Hardware: certified Zebra/Honeywell-class Android scanners, label printers, scales, with their own hardware/helpdesk team.

Key architectural claim to remember: **no separate WMS database**. The scanner transaction *is* the ERP transaction.
ScanDock mirrors that with a transactional outbox to the ERP mock instead (a sync layer), because a toy cannot run inside
NetSuite; the trade-off is worth discussing in an interview (what breaks when the ERP is slow or down, idempotency, retries).

## Engineering and QA stack (from job postings)

* Developers: **React + TypeScript** front end, 3–5 years experience; NetSuite work means **SuiteScript** (JavaScript) in
  the SuiteApp itself.
* QA: "manual and automated testing", "QA is involved in every step of the development cycle", **Playwright, Puppeteer,
  Jasmine**, also Selenium, Postman, REST Assured, Appium, Detox in the automation-engineer variant; **Jira + X-ray**;
  Agile/Scrum with Agile Delivery Specialists (scrum masters); "shift-left alongside DevOps".
* Departments: Product Engineering & Development (RFS for NetSuite, RFS for Oracle Cloud), Product Strategy & Management,
  Professional Services, Customer Support, Hardware.

## How ScanDock maps to it

| RF-SMART | ScanDock |
|---|---|
| Handheld Android client | `/scan/*` handheld shell (phone viewport, scan + Enter) |
| NetSuite / ERP | `erp-mock` ("Nimbus ERP") + outbox sync |
| Receiving / put-away | Receive PO → item → qty → bin |
| Picking strategies | Forward-pick bins first, FIFO; guided bin → item → qty |
| Shipping rules engine | Weight/country/priority carrier rules + tracking numbers |
| Cycle counting (incl. blind) | Counts with snapshot, variance, approval, `blindCounts` setting |
| Bin transfers | Transfers with lot support |
| License plates, work orders, kitting, packing/cartonization | **Not built** (good "what would you add next" answers) |
| Cloud printing / labels | ZPL label generation (bin Code 128, item UPC-A) |

Sources: rfsmart.com (home, /netsuite, /company), RF-SMART NetSuite FAQ Guide PDF, "RF-SMART Mobile SuiteApp Achieves Built
for NetSuite Verification" press release, Greenhouse/Indeed job postings for QA Engineer II / QA Automation Engineer II /
Software Developer, Indeed company page.
