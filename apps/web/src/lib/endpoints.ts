import type {
  AdminAuthorDetailDto,
  AdminAuthorListItemDto,
  AdminDashboardDto,
  AdminTicketDetailDto,
  AdminTicketListParams,
  AdminTicketSummaryDto,
  AdminUserDto,
  AiRunDto,
  AiStatusDto,
  AiStrategyDto,
  AiStrategyKind,
  AiStrategyVersionDto,
  AuthorDashboardDto,
  AuthorProfileDto,
  AuthorTicketDetailDto,
  AuthorTicketSummaryDto,
  AuthSessionDto,
  BookDto,
  BookStage,
  CreateResponseRequest,
  CreateStrategyRequest,
  CreateTicketRequest,
  DraftResultDto,
  KnowledgeSectionDto,
  LoginRequest,
  StrategyTestResultDto,
  TestStrategyRequest,
  TicketCategory,
  TicketStatus,
  UpdateStrategyRequest,
  UpdateTicketRequest,
} from '@bookleaf/contracts';
import { api } from './api-client';

/** Every API call the web app makes, typed with the shared contracts. */
export const endpoints = {
  auth: {
    login: (body: LoginRequest) => api.post<AuthSessionDto>('/auth/login', body),
    logout: () => api.post<{ loggedOut: boolean }>('/auth/logout'),
    me: () => api.get<AuthSessionDto>('/auth/me'),
  },

  author: {
    profile: () => api.get<AuthorProfileDto>('/authors/me'),
    dashboard: () => api.get<AuthorDashboardDto>('/authors/me/dashboard'),
    books: (q: { page?: number; pageSize?: number; search?: string; stage?: BookStage }) =>
      api.getPage<BookDto>('/authors/me/books', q),
    book: (bookCode: string) =>
      api.get<BookDto>(`/authors/me/books/${encodeURIComponent(bookCode)}`),
  },

  tickets: {
    create: (body: CreateTicketRequest) => api.post<AuthorTicketDetailDto>('/tickets', body),
    listMine: (q: { page?: number; pageSize?: number; status?: TicketStatus[]; search?: string }) =>
      api.getPage<AuthorTicketSummaryDto>('/tickets/mine', q),
    getMine: (id: string) => api.get<AuthorTicketDetailDto>(`/tickets/mine/${id}`),
    reply: (id: string, body: string) =>
      api.post<AuthorTicketDetailDto>(`/tickets/mine/${id}/messages`, { body }),
  },

  admin: {
    dashboard: () => api.get<AdminDashboardDto>('/admin/dashboard'),
    users: () => api.get<AdminUserDto[]>('/admin/users'),
    authors: (q: { page?: number; pageSize?: number; search?: string }) =>
      api.getPage<AdminAuthorListItemDto>('/admin/authors', q),
    author: (id: string) => api.get<AdminAuthorDetailDto>(`/admin/authors/${id}`),
    tickets: (q: AdminTicketListParams) =>
      api.getPage<AdminTicketSummaryDto>('/admin/tickets', { ...q }),
    ticket: (id: string) => api.get<AdminTicketDetailDto>(`/admin/tickets/${id}`),
    updateTicket: (id: string, body: UpdateTicketRequest) =>
      api.patch<AdminTicketDetailDto>(`/admin/tickets/${id}`, body),
    assign: (id: string, assigneeId: string | null) =>
      api.post<AdminTicketDetailDto>(`/admin/tickets/${id}/assign`, { assigneeId }),
    addNote: (id: string, body: string) =>
      api.post<AdminTicketDetailDto>(`/admin/tickets/${id}/notes`, { body }),
    respond: (id: string, body: CreateResponseRequest) =>
      api.post<AdminTicketDetailDto>(`/admin/tickets/${id}/responses`, body),
    retriage: (id: string) => api.post<AdminTicketDetailDto>(`/admin/tickets/${id}/ai/classify`),
    draft: (id: string, force = false) =>
      api.post<DraftResultDto>(`/admin/tickets/${id}/ai/draft`, { force }),
  },

  ai: {
    status: () => api.get<AiStatusDto>('/admin/ai/status'),
    knowledgeBase: () => api.get<KnowledgeSectionDto[]>('/admin/ai/knowledge-base'),
    runs: (q: {
      page?: number;
      pageSize?: number;
      strategyId?: string;
      status?: 'SUCCESS' | 'FAILED';
    }) => api.getPage<AiRunDto>('/admin/ai/runs', q),
    strategies: (q: { kind?: AiStrategyKind; category?: TicketCategory } = {}) =>
      api.get<AiStrategyDto[]>('/admin/ai/strategies', q),
    strategy: (id: string) => api.get<AiStrategyDto>(`/admin/ai/strategies/${id}`),
    versions: (id: string) =>
      api.get<AiStrategyVersionDto[]>(`/admin/ai/strategies/${id}/versions`),
    create: (body: CreateStrategyRequest) => api.post<AiStrategyDto>('/admin/ai/strategies', body),
    update: (id: string, body: UpdateStrategyRequest) =>
      api.patch<AiStrategyDto>(`/admin/ai/strategies/${id}`, body),
    activate: (id: string, version: number) =>
      api.post<AiStrategyDto>(`/admin/ai/strategies/${id}/activate`, { version }),
    duplicate: (id: string) => api.post<AiStrategyDto>(`/admin/ai/strategies/${id}/duplicate`),
    test: (id: string, body: TestStrategyRequest) =>
      api.post<StrategyTestResultDto>(`/admin/ai/strategies/${id}/test`, body),
  },
};

/** Centralised query keys so invalidation after mutations/events stays consistent. */
export const queryKeys = {
  session: ['session'] as const,
  author: {
    all: ['author'] as const,
    dashboard: ['author', 'dashboard'] as const,
    books: (q: object) => ['author', 'books', q] as const,
    tickets: (q: object) => ['author', 'tickets', q] as const,
    ticketsAll: ['author', 'tickets'] as const,
    ticket: (id: string) => ['author', 'ticket', id] as const,
  },
  admin: {
    all: ['admin'] as const,
    dashboard: ['admin', 'dashboard'] as const,
    users: ['admin', 'users'] as const,
    tickets: (q: object) => ['admin', 'tickets', q] as const,
    ticketsAll: ['admin', 'tickets'] as const,
    ticket: (id: string) => ['admin', 'ticket', id] as const,
    authors: (q: object) => ['admin', 'authors', q] as const,
    author: (id: string) => ['admin', 'author', id] as const,
  },
  ai: {
    all: ['ai'] as const,
    status: ['ai', 'status'] as const,
    strategies: ['ai', 'strategies'] as const,
    strategy: (id: string) => ['ai', 'strategy', id] as const,
    versions: (id: string) => ['ai', 'versions', id] as const,
    runs: (q: object) => ['ai', 'runs', q] as const,
    knowledgeBase: ['ai', 'kb'] as const,
  },
};
