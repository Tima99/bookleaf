# Bubble Database: Design Notes

The field list is in [bubble-db-schema.md](bubble-db-schema.md). These notes explain the key decisions.

## 1. Bubble in SQL terms

| Bubble | SQL |
|---|---|
| Data type / thing / field | table / row / column |
| Field of a custom type (`Book.author`) | foreign key |
| Option set | enum |
| Search + constraints | `SELECT … WHERE`, run on the server |
| `:filtered` | filtering in the browser after loading |
| Privacy rule | row-level security on every search |

**Key rule:** a search constraint can only test the searched type's own fields. Most of the decisions below
follow from that.

## 2. Types and relationships

- **User:** login only (email, role, link to Author). It is kept separate because authors exist as data before
  they have a login, and admins aren't authors.
- **Author → Book → Payout:** links always go child → parent, like foreign keys.
  - No book list is stored on Author, so nothing has to be written in two places.
  - An author's books are always `Search for Books (author = X)`.
- **Payout:** one row per payment, so payout history is a real list.
- **NotificationLog:** one row per send attempt. It is the shared record between Bubble and n8n.
- **The only two-way link is `User.author` ↔ `Author.user`.** Both are set once, when the login is created.

## 3. Stored totals (why the admin filters are fast)

The admin list filters **authors** by numbers that come from their **books**. So these are stored on Author:

- `book_count`, `total_earned`, `total_paid`, `total_pending`
- `oldest_pending_since`: the earliest `pending_since` among books with pending > 0

On Book, `pending_since` is the last payout date, or the publication date if the book was never paid. It is set
only when something is pending.

**Trade-off:** stored totals must be updated whenever a book changes. Here the data is imported once, so they
are set at import. A real app would recalculate them in the book-update workflow.

## 4. Status is calculated, not stored

"Overdue" depends on today's date, so a stored status would silently go stale. The dates are stored instead
and compared with the current date:

| Badge | Rule |
|---|---|
| Grey | book not published |
| Green | `royalty_pending = 0` |
| Yellow | pending, and `pending_since` within the last 90 days |
| Red | pending, and `pending_since` more than 90 days ago (also covers "never paid") |

The admin status filter uses the same rule on `total_pending` + `oldest_pending_since`, run on the server.

## 5. Privacy rules

| Type | Admin | Author | Everyone else |
|---|---|---|---|
| Author | all | `This Author's user is Current User` | nothing |
| Book / Payout | all | `This … owner is Current User` | nothing |
| NotificationLog | all | nothing | nothing |
| User | all | own record | nothing |

- **Server-side.** Rules are checked on Bubble's server, so even an unfiltered search returns only the
  logged-in author's rows.
- **`owner` field.** `owner` on Book and Payout makes the check a single direct comparison.
- **No open sign-up.** Logins are created from the admin side, so nobody can register with an author's email.
  Auto-binding is off for `role`, so an author can't make themselves an admin.

## 6. Searches used on the pages

| Screen | Data source |
|---|---|
| Author: my books | `Search for Books (author = Current User's author)` |
| Admin: author list | `Search for Authors (city, status constraints)` on the server, then `:filtered` by name in the browser for instant typing |
| Author detail tabs | `Search for Books / Payouts / NotificationLogs (author = page author)` |
| Bulk send | `Search for Authors (total_pending > 0)` |

**"Ignore empty constraints"** is on, so an empty search box or dropdown simply skips that filter.

## 7. How n8n gets the data

Bubble's Free plan has no inbound API.
- **Data in:** Bubble runs the books search itself and posts the author and their books as JSON to n8n.
- **Status back:** n8n replies in the same request, and Bubble updates the NotificationLog.

Snake_case field names keep the JSON keys clean (`royalty_pending`).
