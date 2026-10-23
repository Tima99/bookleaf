# Bubble Database Schema — BookLeaf Royalty Dashboard

This is the build sheet. Open your Bubble editor's **Data** tab and create everything below, in this order:
option sets → data types → fields → import → privacy rules.

The companion document, [bubble-db-explained.md](bubble-db-explained.md), explains *why* it is built this way
and how every screen queries it.

---

## 0. Where to start

| What | URL |
|---|---|
| Create a Bubble account | https://bubble.io → **Get started** (free plan is enough) |
| Your apps / create a new app | https://bubble.io/home → **Create an app** (name it e.g. `bookleaf-royalty`) |
| Editor (after creating) | `https://bubble.io/page?id=bookleaf-royalty` |
| Your running app (free plan = test version) | `https://bookleaf-royalty.bubbleapps.io/version-test` |
| Manual | https://manual.bubble.io |
| Video lessons | https://bubble.io/academy |
| n8n Cloud (for later) | https://n8n.io → **Get started** |

When Bubble asks how to start, choose a **blank app** and skip the AI app generator. You want to build the schema yourself
so you can explain it.

---

## 1. Naming rules

- Field names in **lowercase_with_underscores** (`royalty_pending`, not `Royalty Pending`).
  The Bubble Data API uses field names as JSON keys, so n8n reads `royalty_pending` cleanly.
- Every type keeps the dataset's own ID (`author_code = AUTH001`, `book_code = BK001`). Bubble's built-in
  **unique id** is the real key. The code is for importing, debugging and reading n8n logs.
- Money is a plain `number` (rupees). Format it as currency only on the page.

Bubble adds these to every type automatically. Don't create them: `unique id`, `Created Date`, `Modified Date`,
`Created By`, `Slug`.

---

## 2. Option sets (Data → Option sets)

Option sets are fixed lists defined in the app, like enums. They are faster than data types and can't be
edited by users. The **Display** value must match the dataset text exactly so CSV import works.

| Option set | Options (Display) | Extra attributes |
|---|---|---|
| **Role** | `Admin`, `Author` | — |
| **BookStatus** | `Published & Live`, `In Production - Cover Design`, `In Production - Typesetting` | `is_published` (yes/no): yes / no / no |
| **PrintPartner** | `In-House`, `Repro India`, `Epitome Books` | — |
| **Platform** | `Amazon India`, `Amazon US`, `Amazon UK`, `Flipkart`, `BookLeaf Store` | — |
| **RoyaltyStatus** | `Fully paid`, `Pending`, `Overdue`, `No sales yet` | `color` (text): `#16a34a` / `#ca8a04` / `#dc2626` / `#6b7280` |
| **NotificationStatus** | `Pending`, `Processing`, `Success`, `Failed` | `color` (text) |
| **TriggerSource** | `Single`, `Bulk` | — |

`RoyaltyStatus` is **not stored** on any record. It drives the badge colour and the admin filter dropdown.
Explained doc, section 5.

---

## 3. Data types and fields (Data → Data types)

### 3.1 User (built in — add fields)

| Field | Type | Notes |
|---|---|---|
| email | text | built in |
| role | Role (option set) | Default **Author**. Set to **Admin** by hand in App Data for the admin account |
| author | Author | Empty for admins. Set once when the author's login is created |

### 3.2 Author

| Field | Type | From JSON | Notes |
|---|---|---|---|
| author_code | text | `author_id` | `AUTH001` |
| name | text | `name` | searched by the admin name box |
| email | text | `email` | used to create the author's login |
| phone | text | `phone` | text, not number (it has `+` and `-`) |
| city | text | `city` | filtered by the admin city dropdown |
| joined_date | date | `joined_date` | |
| user | User | — | the login that owns this author. Empty until provisioned |
| book_count | number | *derived* | count of books |
| total_earned | number | *derived* | sum of `total_royalty_earned` |
| total_paid | number | *derived* | sum of `royalty_paid` |
| total_pending | number | *derived* | sum of `royalty_pending` |
| last_payout_date | date | *derived* | latest `last_royalty_payout_date` across books (empty if never paid) |
| oldest_pending_since | date | *derived* | earliest `pending_since` among this author's books with pending > 0. Empty if nothing pending |

### 3.3 Book

| Field | Type | From JSON | Notes |
|---|---|---|---|
| book_code | text | `book_id` | `BK001` |
| author | Author | parent author | **the relationship**: every book points to exactly one author |
| owner | User | — | copy of `author's user`. Exists only for privacy rules (explained doc §6) |
| title | text | `title` | |
| isbn | text | `isbn` | text: it contains `-` and `X` |
| genre | text | `genre` | free text (many combinations like "Romance / Humor") |
| status | BookStatus | `status` | |
| publication_date | date | `publication_date` | empty for books in production |
| mrp | number | `mrp` | empty for books in production |
| royalty_per_copy | number | `author_royalty_per_copy` | empty for books in production |
| copies_sold | number | `total_copies_sold` | |
| royalty_earned | number | `total_royalty_earned` | |
| royalty_paid | number | `royalty_paid` | |
| royalty_pending | number | `royalty_pending` | |
| last_payout_date | date | `last_royalty_payout_date` | empty = never paid |
| pending_since | date | *derived* | if `royalty_pending > 0`: `last_payout_date`, or `publication_date` if never paid. Otherwise empty |
| print_partner | PrintPartner | `print_partner` | empty for books in production |
| available_on | list of Platform | `available_on` | empty list for books in production |

### 3.4 Payout

One row per actual payment. The dataset only gives a *total paid* and a *last payout date* per book, so the
import creates **one Payout per book where `royalty_paid > 0`** (12 rows). Future payouts are added as new rows.

| Field | Type | Notes |
|---|---|---|
| book | Book | |
| author | Author | stored too, so "payout history for an author" is one search |
| owner | User | for privacy rules |
| amount | number | `royalty_paid` |
| paid_on | date | `last_royalty_payout_date` |
| note | text | `Imported: cumulative amount from dataset` |

### 3.5 NotificationLog

One row per "Generate & Send" attempt. Bubble creates it as **Pending**; n8n updates it.

| Field | Type | Who writes it | Notes |
|---|---|---|---|
| author | Author | Bubble | |
| status | NotificationStatus | Bubble → n8n | Pending → Processing → Success / Failed |
| source | TriggerSource | Bubble | Single button or Bulk button |
| triggered_by | User | Bubble | the admin who clicked |
| request_id | text | Bubble | `author_code` + time. Sent to n8n for de-duplication |
| email_subject | text | n8n | AI output |
| email_body | text | n8n | AI output (shown in the log) |
| error_message | text | n8n / Bubble | why it failed |
| completed_at | date | n8n | timestamp of Success / Failed |
| n8n_execution_id | text | n8n | lets you find the run in n8n |

---

## 4. Relationship diagram

```
 User ──(author)──────────► Author ◄──(user)── (same pair, set together once)
                              ▲
                  (author)    │    (author)
        Book ─────────────────┘◄───────────── Payout
         ▲                                      │
         └───────────────(book)─────────────────┘

 NotificationLog ──(author)──► Author
 Book.owner / Payout.owner ──► User   (privacy shortcut)
```

Links point from the **many** side to the **one** side (Book → Author), the same as a foreign key in SQL.
No type stores a "list of Books". The explained doc, §3, says why.

---

## 5. Import order

1. Create option sets and data types (sections 2–3).
2. **Data → App data → Upload** a CSV into **Author**, with the derived columns already filled in.
3. Export Authors (App data → Export) to get each author's Bubble `unique id`.
4. Upload **Book** with the `author` column holding the Author's unique id.
5. Export Books, then upload **Payout** with the `book` and `author` unique ids.
6. Leave `user` / `owner` empty. They are filled when an author's login is created (explained doc §6).

Dates: set **Settings → General → Time zone** to `Asia/Kolkata` before importing so `2025-10-15` doesn't show as
the 14th.

---

## 6. Check after import

Expect **10 authors, 18 books** (2 in production: BK013, BK015) and **12 payout rows**.

Every dataset author with a pending amount shows **Overdue**, because the last payouts are all in 2025. Only
AUTH008 shows Fully paid. The test author's book BK901 shows the yellow Pending badge.
