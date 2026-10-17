import { Router } from 'express';
import { BookCodeParamsSchema, BookListQuerySchema } from '@bookleaf/contracts';
import { ForbiddenError } from '../../common/errors';
import { handle, ok, paginated, requireUser } from '../../common/http';
import type { BookService } from '../books/book.service';

/** `/api/v1/authors/me/*` — the signed-in author's own profile, books and dashboard. */
export function createAuthorSelfRouter(deps: { books: BookService }) {
  const { books } = deps;
  const router = Router();

  const authorIdOf = (req: Parameters<typeof requireUser>[0]): string => {
    const user = requireUser(req);
    if (!user.authorId) throw new ForbiddenError('Only authors have a personal library');
    return user.authorId;
  };

  router.get(
    '/',
    handle({}, async ({ req }) => ok(await books.getAuthorProfile(authorIdOf(req)))),
  );

  router.get(
    '/dashboard',
    handle({}, async ({ req }) => ok(await books.getDashboard(authorIdOf(req)))),
  );

  router.get(
    '/books',
    handle({ query: BookListQuerySchema }, async ({ req, query }) => {
      const { items, meta } = await books.listForAuthor(authorIdOf(req), query);
      return paginated(items, meta);
    }),
  );

  router.get(
    '/books/:bookId',
    handle({ params: BookCodeParamsSchema }, async ({ req, params }) =>
      ok(await books.getForAuthor(authorIdOf(req), params.bookId)),
    ),
  );

  return router;
}
