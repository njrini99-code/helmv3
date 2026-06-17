# Texting College Golf Coaches: Legal Risk + Best-Practices Memo

**To:** Founder, Helm Sports Labs / GolfHelm
**Re:** "Could we get sued for texting coaches? What does the law actually say? What are best practices?"
**Date:** 2026-06-16
**Disclaimer:** This is general information synthesized from public legal sources, **not legal advice.** TCPA and state mini-TCPA law is fast-moving (several key 2025–2026 decisions are very recent and contested). Have a TCPA practitioner review before launching any texting program, and specifically clear Florida, Oklahoma, and Washington.

> Produced by a 15-agent research workflow: 7 web-researched angles, each adversarially fact-checked for accuracy and currency, then synthesized. Confidence levels and a verification "honesty ledger" (§7) are included.

---

## 1. Bottom-Line Risk Verdict

**Can you get sued? Technically yes — anyone can be sued. Is the realistic exposure for the program as described catastrophic? No. Is it zero? Also no.** The risk is almost entirely about *how* you text, not *whether* you text.

The single most important distinction to internalize: **one personalized text to a coach's published office line is a fundamentally different legal act than a scripted campaign blasting personal cell numbers.**

| Conduct | Risk |
|---|---|
| One human-typed text to a **confirmed athletic-department office line**, identifying yourself, easy opt-out | **Very low** |
| Text to a coach who **already replied / inquired** (consent exists) | **Very low** |
| Low-volume, one-at-a-time text to a number you can't confirm is office vs. cell | **Low–moderate** |
| **Scripted/automated** send (osascript loop) to **personal cells** | **Moderate–high** |
| Texting a **Washington-resident cell** with no consent | **High** (worst landmine) |
| Ignoring or mishandling an **opt-out** in any wording | **High** (strict, no excuses) |
| Adding **prerecorded / AI voice / ringless voicemail** | **High** (separate ban) |

**Why mistakes are expensive (the damages engine):** $500 per text, trebled to **$1,500** for willful/knowing violations, **no aggregate cap**, **no need to prove harm**, a **single text can confer standing**, and **~80%+ of TCPA suits are class actions** driven by serial/professional plaintiffs (2,788 federal TCPA cases in 2024, +67% YoY; class filings +112% YoY in Q1 2025). So the danger is not your careful first text — it is **drift**: drift toward automation, drift toward personal cells, drift toward volume.

**Net:** moderate-and-manageable if done as a paced, personalized, manual, office-line-and-consent program with instant opt-out honoring and FL/OK/WA cell suppression. It becomes genuinely risky the moment it becomes a scripted blast to cells.

---

## 2. What the Law Actually Says

### 2.1 Federal TCPA — the autodialer / Duguid question (mostly in your favor)

The most-litigated federal hook is the ban on using an **"automatic telephone dialing system" (ATDS)** to text cell phones without consent (47 U.S.C. § 227(b)). After **Facebook, Inc. v. Duguid** (SCOTUS, Apr. 1, 2021, 9-0), an ATDS is limited to equipment that can **store or produce numbers using a random or sequential number generator.** Dialing from a **hand-built, curated list** — whether sent manually or by a thin script that pulls saved numbers — is **not** an ATDS. The osascript-from-a-CRM design sits squarely in the safer category.

**Caveat (honest):** "Not an autodialer" ≠ "no TCPA risk." Duguid disposes only of the *autodialer* hook. Three other things still matter, and Duguid's footnote 7 leaves a narrow, rarely-successful argument about latent "capacity." A curated-list text is **not** where those edge arguments have won. **Confidence: high** that hand-built-list texting is outside the ATDS definition.

### 2.2 No blanket B2B exemption under § 227(b); the personal-cell problem

There is **no general business-to-business exemption** to § 227(b)'s cell-phone restrictions. Texting a coach's number does not become lawful merely because it's business outreach. And a **personal cell is treated as "residential"** even when used for work — the Ninth Circuit's *Chennette v. Porch* treats mixed-use wireless numbers on the DNC list as presumptively residential. **You usually can't tell from the number** whether it's a personal cell or an office line — which is exactly why segmenting your ~29% before sending is the core mitigation. **Confidence: high.**

### 2.3 Prerecorded / artificial voice (a separate, absolute trap)

Section 227(b) **independently** bans artificial/prerecorded **voice** to cells regardless of the autodialer question, and AI voice is an active FCC enforcement priority. This is irrelevant to plain text — *until* anyone adds ringless voicemail, AI voice, or a recorded call. **Rule: plain SMS/iMessage only, ever.** **Confidence: high.**

### 2.4 Do-Not-Call (§ 227(c)) + internal suppression + opt-out (the durable obligation)

This is the bigger, more durable regime, and it is **not** limited to the National Registry:

- The **National DNC Registry and § 227(c)** protect, by statute, **"residential telephone subscribers."** A **true office/work line is generally outside** it. A **personal cell is inside** it. (Note: the FTC's 2024 TSR amendment *narrowed* the old B2B exemption so misrepresentation rules now reach B2B, but office lines remain outside the **Registry** itself.)
- **Every business doing solicitation must maintain a written internal Do-Not-Call policy and a company-specific suppression list,** honor individual opt-outs, and keep records ~5 years. This is **channel-agnostic and survives all the litigation uncertainty** — it's your highest-leverage compliance step. The FCC briefly proposed killing this rule in Oct. 2025 but **reversed and kept it** (adopted Oct. 28, 2025).
- **Opt-out rule (effective Apr. 11, 2025):** you must honor a revocation by **any reasonable means** — not just the literal word "STOP" — within **10 business days** (in practice: instantly). Only **one** neutral confirmation message is permitted (no marketing, within ~5 minutes). A narrow "revoke-all / cross-category" sub-rule has been pushed to **Jan. 31, 2027**, but the core duty applies now. **Confidence: high.**

**The live, unsettled question — do texts even count as "calls" for DNC purposes?** Genuinely **split** in 2025–2026:
- **Texts are NOT calls** (so no § 227(c) DNC claim): *Jones v. Blackstone* (C.D. Ill., Jul. 21, 2025), *Irvin v. Sonic* (N.D. Ga., Apr. 2026), plus IN/FL/OH courts.
- **Texts ARE calls:** *Wilson v. Skopos* (D. Or., same day as Jones), the Ninth Circuit, SDNY.

This split was super-charged by **McLaughlin Chiropractic v. McKesson** (SCOTUS, Jun. 20, 2025), which held district courts **no longer must defer** to FCC TCPA interpretations — so the rules are more contestable and **forum-dependent** than usual. This is **favorable-but-unsettled** for texters; **do not rely on "texts aren't calls"** — it could flip, including retroactively. The § 227(c) private right also requires **more than one** contact in 12 months to the same person, so a true **one-and-done** text (with opt-out honored) materially reduces this exposure. **Confidence: high that the split exists; the protective reading is uncertain.**

*Honest precision note from verification:* the § 227(c) damages figure is "**up to** $500" (a discretionary ceiling at the court's discretion), not an automatic $500 floor; the fixed $500 floor is the § 227(b) figure. Both treble to $1,500 for willful. The "financially explosive" framing still holds, but an emerging **due-process counter-trend** may let courts reduce grossly disproportionate *aggregate* class awards.

### 2.5 The lead-gen "one-to-one consent" rule — a non-issue for you

The FCC's one-to-one consent rule was **vacated** by the Eleventh Circuit (*Insurance Marketing Coalition v. FCC*, Jan. 24, 2025) and never took effect. It governed lead-generation consent capture — **irrelevant** to GolfHelm texting its own first-party curated contacts. Flagged only because it's in the news. **Confidence: high.**

### 2.6 State mini-TCPAs (the overlay that actually catches texters)

Several states go **beyond** federal law, reach **out-of-state senders**, and carry private rights of action at ~$500/message. **There is no general B2B exemption in any of the three sharpest ones.**

- **WASHINGTON — CEMA (RCW 19.190.060): your single biggest landmine.** Bans **any** commercial electronic text to a number assigned to a **WA resident's cell** without prior clear, affirmative **consent**. **No autodialer requirement. No B2B carve-out.** A per-se Consumer Protection Act violation at **$500/message** (treble available). A 2025 appellate ruling (*Aaland v. CRST*, review pending at WA Supreme Court) held even **recruiting** texts are "commercial." **A scripted coach-outreach text to a WA-resident coach's cell is squarely within this even if sent one at a time.** A 2026 amendment (HB 2274) appears to target the *email* provisions, not the text provision — assume text exposure remains $500/message. **Confidence: high.**
- **FLORIDA — FTSA (Fla. Stat. § 501.059):** private right, greater of actual or **$500/violation** (treble $1,500). The core text prohibition is keyed to an **"automated system"** — post-2023 narrowed to a system that **both selects AND dials** — and now requires a plaintiff to first reply "STOP" and keep receiving texts for **15 days** before suing. **Genuinely manual, one-at-a-time texts plausibly fall outside** the core prohibition; **an osascript auto-loop is the exact "automated selection and dialing" plaintiffs argue against.** "Personalized wording" does **not** cure it. **Confidence: medium** (fact-intensive, litigated).
- **OKLAHOMA — OTSA:** bans solicitation involving "an automated system for the selection **OR** dialing" (broader "OR" than federal), **$500/$1,500**, rebuttable presumption that an OK area code = OK resident. **Confidence: high.**
- **Expanding landscape:** Maryland (2024), **Texas SB 140** (Sept. 2025, now explicitly covering text/image, tied to DTPA treble + fees), plus Georgia/Connecticut/Virginia (2026), several with stricter calling-hour and frequency caps. Nationwide outreach = exposure to the **strictest applicable state's** rules. **Confidence: medium.**

**Takeaway:** the practical pattern is — **manual sending helps in FL/OK (automated-system-keyed)** but **does nothing in WA (consent-keyed).** Suppress FL/OK/WA cells from cold/automated texting until you have consent.

---

## 3. Apple iMessage ToS + Carrier / A2P Reality (operational, separate from law)

This is the part founders miss: **even where the law is satisfied, the *operational* layer can still shut you down.**

- **Apple iMessage / Messages Terms:** Apple's iCloud/iMessage Terms prohibit using the service for **bulk, unsolicited, or commercial messaging.** Driving Messages via **osascript** for a scripted outreach campaign is a **Terms-of-Service violation** that risks **Apple ID suspension / iMessage de-registration** — a business-continuity risk independent of any lawsuit. iMessage is a consumer product, not a sanctioned business-messaging channel.
- **Carrier / A2P 10DLC reality:** Legitimate **application-to-person** business texting in the U.S. runs over registered **10DLC** with brand/campaign vetting, carrier consent rules, mandatory opt-out keyword handling, and quiet-hours enforcement. A Mac-scripted workaround **bypasses** this framework, which is why carriers/Apple flag and block it as gray-market traffic — and why it doesn't scale.
- **Implication:** a one-off personal text from your phone is fine. A **scripted Mac pipeline at any volume** invites number/account blocking and ToS termination *before* any legal question. If texting becomes a real channel, migrate to a **compliant A2P/10DLC provider** with built-in consent capture, STOP handling, and time-of-day controls.

---

## 4. Email vs. Text — the Opt-OUT vs. Opt-IN Asymmetry (this is your edge)

This is the crispest practical point in the whole memo:

| | **Email (CAN-SPAM)** | **Text (TCPA + state mini-TCPAs)** |
|---|---|---|
| Consent model | **Opt-OUT** | Trends **opt-IN / consent-first** |
| Can you cold-contact? | **Yes** — cold email is lawful | Risky; safest only with consent or to office lines |
| Requirements | Truthful headers/subject, identify as ad if applicable, **valid physical postal address**, working **unsubscribe** honored ~10 days, no harvested lists | Internal DNC list, honor any "stop," ID + opt-out, FL/OK/WA cell suppression, no autodialer/voice |
| Per-violation damages | Civil penalties (FTC-enforced); **no broad private class-action bar** | **$500–$1,500/text, private right, ~80% class actions** |
| Who sues | Primarily FTC/AG enforcement | **Serial/professional plaintiffs + class counsel** |

**The asymmetry in one line:** with email you may contact a coach who never asked, then let them leave (opt-out). With text the safe posture is the reverse — contact mainly those who **opted in** (or a clean business line), because the private-plaintiff machinery and per-message damages make cold texting the higher-variance bet. **Your cold email already works and lands in Primary — that is the channel built for cold reach. Texting is built for the warm follow-up.**

---

## 5. Best-Practices Playbook for Reaching College Golf Coaches

**Channels (in priority order):**
1. **Cold email** (your live, working, Primary-landing channel) — primary cold engine; reaches 100% of coaches, not just the 29% with phones.
2. **Text** — reserved for warm/consented coaches and confirmed office lines only.
3. **Voice / LinkedIn / event presence** — for relationship-building and warm intros.

**Consent & compliance (non-negotiable):**
- Maintain a **written internal Do-Not-Call policy** + master **suppression list**; scrub every send.
- **Honor any opt-out in any wording, instantly, permanently, across all channels.** One neutral confirmation only.
- **Record consent** (timestamp, source, exact language) for any coach who replies/forms/asks.
- **Segment the 29%** into office line / personal cell / unknown before any text.
- **Suppress FL/OK/WA cells** from cold/automated texting until consent exists.
- **Send 8am–9pm local time** only.
- Keep records **~5 years.**

**Cadence & volume:**
- **Low volume, paced, one-and-done** per coach (and one-at-a-time/manual for FL/OK posture). Avoid bulk blasts — they break the "manual, relationship-based" posture *and* invite Apple/carrier blocks.
- Lead each first message with **who you are (Helm Sports Labs / GolfHelm)**, the **specific program/coach reference**, and an **easy opt-out**.

**Timing / NCAA calendar:**
- Avoid the **competitive championship windows** (coaches traveling, heads-down) and **dead/quiet recruiting periods.**
- Reach out in **off-season and pre-season planning windows**, early in the week, business hours, when coaches are at a desk — not in the field at a tournament.

**Who buys / social proof (go-to-market):**
- At **D2/D3**, the **head coach** is usually the decision-maker for a single team (small budgets, often self- or AD-approved). Speak to the head coach, not a procurement office.
- Lead with **peer programs already on GolfHelm**, a **concrete stat/outcome win**, and a **low-friction demo** — peers and proof convert this audience far better than feature lists.

---

## 6. Recommended Approach for Helm Sports Labs

Given **mostly D2/D3 coaches** and **~29% phone coverage that mixes office lines and personal cells:**

1. **Email is the cold channel; texting is the warm/consent/office-line channel.** Do not invert this.
2. **Keep scaling cold email** — it's lawful (opt-out, with ID + postal address + honored unsubscribe), reaches everyone, and is the lowest-variance way to grow.
3. **Before any text, segment the 29%** into office / personal-cell / unknown.
4. **Text only:** (a) coaches who already replied/inquired (consent), or (b) **confirmed office lines** — never apparent/unknown personal cells for cold outreach.
5. **Suppress FL/OK/WA cells** from any cold/automated texting until consent exists; WA-resident cells are the worst exposure.
6. **Send one-at-a-time/human-typed, low volume, one-and-done**, 8am–9pm local, with self-ID + easy opt-out; honor any "stop" instantly and permanently.
7. **Never** add prerecorded/AI voice or ringless voicemail.
8. **Don't scale on osascript/iMessage** — it likely violates Apple's Terms and invites carrier/account blocking. If texting becomes a real channel, move to a **compliant A2P/10DLC provider.**
9. **Maintain the written internal DNC policy + suppression list + consent records (~5 yr).**
10. **Have TCPA counsel review before launch** and specifically clear FL/OK/WA and your likely litigation forums.

---

## 7. Where Verification Refuted or Downgraded Claims (honesty ledger)

- **Texts-as-"calls" for DNC:** genuinely **split and unsettled** (Jones/Irvin vs. Wilson/9th Cir.), made fluid by *McLaughlin*. **Do not rely** on the favorable reading. **Confidence downgraded to medium/forum-dependent.**
- **§ 227(c) damages:** "**up to** $500" (discretionary ceiling), not an automatic floor; the fixed $500 floor is § 227(b). Treble to $1,500 for willful applies to both. An emerging **due-process** trend may reduce grossly disproportionate aggregate class awards.
- **FTSA manual-sending safety:** **medium confidence** only — fact-intensive and litigated; an osascript auto-loop is the gray-zone "automated selection and dialing" plaintiffs target. WA's CEMA gives **no** such manual-sending escape.
- **FTC TSR "no B2B" framing:** partly stale — the 2024 TSR amendment narrowed the B2B exemption (misrepresentation rules now reach B2B), though **office lines remain outside the DNC Registry.**
- **State landscape:** **medium confidence**, fast-expanding (TX SB 140, MD, GA/CT/VA 2026); nationwide outreach = strictest-state exposure. Confirm current state law before launch.
- **Citation precision (from verification):** the Eleventh Circuit Salcedo-reversal case is *Drazen v. Pinto* (2023); *Cranor v. 5 Star* was 2021; the revoke-all delay to Jan. 31, 2027 came via a Jan. 6, 2026 FCC order.

---

## Sources

**Federal TCPA / autodialer / consent:**
- Facebook, Inc. v. Duguid (SCOTUS) — https://www.supremecourt.gov/opinions/20pdf/19-511_p86b.pdf
- McLaughlin Chiropractic v. McKesson (SCOTUS) — https://www.supremecourt.gov/opinions/24pdf/23-1226_1a72.pdf
- 47 U.S.C. § 227 (TCPA) — https://www.law.cornell.edu/uscode/text/47/227
- 47 CFR 64.1200 (prior express written consent; (f)(9)) — https://www.ecfr.gov/current/title-47/chapter-I/subchapter-B/part-64/subpart-L/section-64.1200
- Crowell & Moring — Duguid autodialer limit — https://www.crowell.com/en/insights/client-alerts/supreme-court-limits-the-tcpa-s-definition-of-autodialer
- Gordon Rees — Duguid summary — https://www.grsm.com/insight/supreme-court-narrows-autodialer-def-in-major-victory-for-tcpa-defendants-in-facebook-v-duguid/
- Cooley — McLaughlin: new era of TCPA — https://www.cooley.com/news/insight/2025/2025-07-01-mclaughlin-chiropractic-us-supreme-court-invites-new-era-of-tcpa-jurisprudence

**DNC / opt-out / internal list:**
- FTC — Complying with the Telemarketing Sales Rule — https://www.ftc.gov/business-guidance/resources/complying-telemarketing-sales-rule
- FTC — National Do Not Call Registry FAQs — https://consumer.ftc.gov/national-do-not-call-registry-faqs
- FCC Report and Order FCC-24-24 (consent revocation / DNC-for-texts) — https://docs.fcc.gov/public/attachments/FCC-24-24A1.pdf
- BCLP — New opt-out rules effective Apr. 11, 2025 — https://www.bclplaw.com/en-US/events-insights-news/the-tcpas-new-opt-out-rules-take-effect-on-april-11-2025-what-does-this-mean-for-businesses.html
- CFS Law Monitor — FCC extends revoke-all to Jan. 31, 2027 — https://www.consumerfinancialserviceslawmonitor.com/2026/01/fcc-further-extends-effective-date-for-tcpa-revoke-all-rule/
- Bubeck Law — FCC keeps internal DNC rule (Oct. 2025) — https://www.bubecklaw.com/privacyspeak/fcc-reverses-course-internal-do-not-call-rule-will-stay
- Privacy World — Oct. 2025 NPRM / DNC changes deleted — https://www.privacyworld.blog/2025/10/fcc-proposes-amendments-to-tcpa-consent-revocation-rules-proposed-changes-to-dnc-rules-deleted-from-final-text/
- Wipfli — Do Not Call policy basics — https://www.wipfli.com/insights/articles/do-not-call-policy-what-businesses-need-to-know
- CompliancePoint — B2B Marketing and the TCPA — https://www.compliancepoint.com/resources/b2b-marketing-and-the-tcpa/
- DNC.com — Established Business Relationship exemption — https://www.dnc.com/blog/understanding-the-established-business-relationship-exemption-ebr

**Texts-as-calls split / standing:**
- Hogan Lovells — district courts divided on DNC-for-texts — https://www.hoganlovells.com/en/publications/district-courts-increasingly-divided-on-whether-the-tcpa-allows-donot-call-claims-for-texts
- Polsinelli — Jones v. Blackstone — https://www.polsinelli.com/publications/federal-court-tcpa-text-decision
- Greenspoon Marder — Irvin v. Sonic / texts not calls — https://www.gmlaw.com/news/tcpa-section-227c-after-irvin-v-sonic-why-texts-are-not-telephone-calls/
- Financial Services Perspectives (Bradley) — conflicting rulings — https://www.financialservicesperspectives.com/2025/07/a-new-era-for-tcpa-litigation-conflicting-rulings-on-text-messages-and-do-not-call-rule/
- Faegre Drinker — Drazen v. Pinto / single-text standing — https://www.faegredrinker.com/en/insights/publications/2023/8/eleventh-circuit-overturns-salcedo-holding-that-one-text-is-sufficient-for-tcpa-standing

**Damages / litigation stats:**
- Burr & Forman — TCPA recoverable damages — https://www.burr.com/telephone-consumer-protection-act/the-tcpa-recoverable-damages
- Roth Jackson — § 227(c) damages "up to $500" — https://www.rothjackson.com/blog/2025/02/reminder-that-statutory-damages-for-a-dnc-violation-should-not-start-at-500-per-call-or-text/
- CompliancePoint — 2025 TCPA litigation trends — https://www.compliancepoint.com/wp-content/uploads/2026/04/TCPA-Litigation-Trends-2025.pdf
- CompliancePoint — Professional plaintiffs and the TCPA — https://www.compliancepoint.com/marketing-compliance/professional-plaintiffs-and-the-tcpa/

**One-to-one consent vacated:**
- Insurance Marketing Coalition v. FCC (11th Cir.) — https://media.ca11.uscourts.gov/opinions/pub/files/202410277.pdf
- Goodwin — fatal blow to one-to-one consent — https://www.goodwinlaw.com/en/insights/publications/2025/01/alerts-otherindustries-eleventh-circuit-deals-fatal-blow

**State mini-TCPAs:**
- Florida FTSA (Fla. Stat. 501.059) — https://www.flsenate.gov/laws/statutes/2023/501.059
- Perkins Coie — Florida narrows FTSA — https://perkinscoie.com/insights/blog/florida-significantly-narrows-ftsa
- Morrison Foerster — uptick in FTSA litigation — https://www.mofo.com/resources/insights/241111-uptick-in-florida-telephone-solicitation-act-litigation
- CompliancePoint — Oklahoma Telephone Solicitation Act — https://www.compliancepoint.com/marketing-compliance/oklahoma-telephone-solicitation-act/
- Washington CEMA (RCW 19.190.060) — https://app.leg.wa.gov/rcw/default.aspx?cite=19.190.060
- Arnold & Porter — WA courts broaden CEMA (Aaland v. CRST) — https://www.arnoldporter.com/en/perspectives/advisories/2025/10/washington-courts-broaden-cema-liability
- Kaufman Dolowich — state mini-TCPA laws growing; Texas SB 140 — https://www.kaufmandolowich.com/news-resources/law-alert-state-mini-tcpa-laws-growing-texas-latest-to-update-its-telemarketing-rules-8-21-2025/
- LeadGen Economy — state mini-TCPA overview (FTSA/OTSA) — https://www.leadgen-economy.com/blog/state-mini-tcpa-laws-ftsa-otsa/

---

*This memo is general information, not legal advice. The law cited is current as of June 2026 and is fast-moving — several controlling questions (texts-as-calls, state mini-TCPAs) are genuinely unsettled and forum-dependent. Engage TCPA counsel before launching any texting program.*
