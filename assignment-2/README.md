# BookLeaf: Author Royalty Dashboard & Automated Notification System

Assignment 2: Bubble.io + n8n + AI.

| | |
|---|---|
| **Live app** | https://bookleaf-24417.bubbleapps.io/version-test (Bubble Free plan, app `bookleaf-24417`) |
| **n8n workflow** | https://bookleaf-assignment.app.n8n.cloud/workflow/nLqr5iztgpTQj1tR · export: [n8n/bookleaf-royalty-summary.workflow.json](n8n/bookleaf-royalty-summary.workflow.json) |
| **Schema detail** | [bubble-db-schema.md](bubble-db-schema.md) (fields) · [bubble-db-explained.md](bubble-db-explained.md) (reasoning) |

**Test logins.** Open the login page with `?test-creds=1` for one-click fill buttons.

| Role | Email | Password |
|---|---|---|
| Admin | `support.lead@bookleaf.test` | `Admin@2026` |
| Author | `priya.sharma@email.com` (or any dataset author) | `Author@2026` |

---

## 1. Database design

```
User ──► Author ◄── Book ◄── Payout
           ▲
NotificationLog
```

- **Types:**
  - User (login, role)
  - Author
  - Book
  - Payout (one row per payment, so payout history is a real list)
  - NotificationLog (one row per send attempt, the record both Bubble and n8n write to)
- **Links go child → parent**, like foreign keys. No book lists are stored on Author, so nothing can drift out
  of sync.
- **Totals are stored on Author** (`total_pending`, `oldest_pending_since`, …). Bubble searches can only filter
  on the searched type's own fields, so this keeps every admin filter on the server. The trade-off is that totals
  must be refreshed when a book changes.
- **Status is never stored.** "Overdue" depends on today's date, so the dates are stored and compared at view
  time.
- **Option sets** for fixed lists: book status, platform, print partner, role, notification status.
- **Privacy rules:**
  - Admins see everything.
  - Authors see only rows where `owner` / `user` is themselves.
  - Everyone else sees nothing.
  - Logins are created by the admin side, so nobody can sign up as an author.

Data: 10 authors, 18 books, 12 payouts from the dataset, plus a made-up **Test Author (AUTH011)** for testing.
All dataset pending royalties are now overdue (last payouts are in 2025). Test Author's book BK901 shows the
yellow "pending" badge.

---

## 2. Bubble ↔ n8n integration

**The Free plan has no inbound API.** Bubble's Data API and Workflow API both return *"This application does not
expose an API"*. So n8n can't fetch from or call back into Bubble.

- **Data in:** Bubble sends the full payload to the webhook (the assignment allows this for step 2).
- **Status back:** n8n's status comes back as the **reply to Bubble's request**.
- **Paid plan:** a real callback workflow (`n8n_callback`) is built and ready.

```
Admin clicks "Generate & Send"
 → Bubble creates NotificationLog (Processing) + schedules a 3-min timeout
 → Bubble POSTs author + books to n8n  (header X-BookLeaf-Key)
 → n8n: check secret → validate → de-duplicate → compute facts → OpenAI → check draft → Resend email
 → n8n replies {status, email_subject, email_body, error_message, n8n_execution_id}
 → Bubble sets the log to Success or Failed
```

- **Bubble:**
  - API Connector call `royalty_summary`, with the secret as a private header.
  - The JSON body is built with `:format as text` and `:formatted as JSON-safe`.
  - Bulk send schedules one run per author with pending royalties.
- **n8n:**
  - Webhook → Code (validate / de-duplicate) → IF nodes → Code (facts) → OpenAI → Code (check) → Resend
    → Respond.
  - Failures use error branches into one failure path.
  - Every path answers Bubble in the same JSON shape.
- **Email safety:** only the test author gets real mail. Dataset addresses go to Resend's test inbox.

---

## 3. AI prompt strategy

- **Code decides facts, the AI writes prose.** Totals, per-book status, the 90-day overdue rule, the ₹1,000
  minimum and the next payout date (quarterly + 45 days, from the Knowledge Base) are calculated in n8n. They are
  passed to the model as a `<facts>` block.
- **The system prompt** holds the royalty policy and tone guidelines from Assignment 1, plus a fixed structure:
  - greeting by name
  - each book's figures
  - totals
  - when to expect payout
  - an apology + 48-hour review if overdue
  - a positive note if fully paid
  - an update for books in production
  - one next step
  - the sign-off
- **Hard rules:** use only the given figures, invent nothing, plain text, 150–350 words, reply as
  `{"subject","body"}` JSON.
- **Checks before sending:** the draft is rejected if it has no subject, is too short, doesn't greet the author
  by name, or leaks an internal label.

---

## 4. Error handling & idempotency

| Case | Result |
|---|---|
| Wrong / missing secret | n8n returns 401; the log fails at the 3-minute timeout |
| Missing data or no books | Button disabled; n8n also refuses: "Summary not generated: …" |
| OpenAI fails (after 2 tries) | Failed: "The AI service couldn't write the email right now… try again" |
| Draft fails checks | Failed: "The AI draft didn't pass our quality checks…" |
| Email fails | Success (the summary is saved) + "email could not be delivered: …" |
| n8n unreachable | Bubble's 3-minute timeout marks it Failed |

- **Messages:** every message is plain English first, with the technical detail at the end.
- **No silent failures:** failed runs also show as failed in n8n (Stop and Error).
- **Idempotency:** the button is locked while a send is in progress, the backend skips authors with one in
  progress, and n8n skips repeats for the same author within 2 minutes.

---

## 5. Challenges & learning

| Problem | Fix |
|---|---|
| Free plan has no inbound API | Send the payload to n8n; n8n replies inline |
| Backend workflow parameters came through empty (no editor error) | Found via Bubble server logs: read parameters with the API-workflow parameter source |
| Free-plan "workflow limit" blocked the API call inside backend workflows | Single sends call n8n from the page workflow |
| Author with no books sent `[null]` and crashed n8n | Filter nulls in n8n + block the button in Bubble |
| Laggy name search | Name filter runs in the browser; city/status stay on the server |

How I learned Bubble:
- treat it like SQL (types = tables, searches = queries)
- set up privacy first
- rely on **server logs** when the editor shows no errors
- test each change end to end with a made-up author, so real data isn't sent to the AI while debugging

**Known limits (Free plan):** no true callback; bulk send can hit the workflow limit; author totals aren't
recalculated automatically.
