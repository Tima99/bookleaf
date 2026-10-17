'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Alert, Button, Form, Input } from 'antd';
import { motion } from 'framer-motion';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { LoginRequestSchema, type LoginRequest } from '@bookleaf/contracts';
import { BrandMark } from '@/components/layout/brand';
import { homeFor, useAuth } from '@/features/auth/auth-provider';
import { errorMessage } from '@/lib/api-client';

/**
 * Test accounts for reviewers. Hidden by default; shown only on /login?test-creds=1
 * (the README links there). These are the seeded demo passwords, not real credentials.
 */
const TEST_ACCOUNTS = [
  { label: 'Author · Priya Sharma', email: 'priya.sharma@email.com', password: 'Author@2026' },
  {
    label: 'Author · Kavita Deshmukh',
    email: 'kavita.deshmukh@email.com',
    password: 'Author@2026',
  },
  { label: 'Admin · Aditi Rao', email: 'support.lead@bookleaf.test', password: 'Admin@2026' },
];

function LoginForm() {
  const { login, user, isLoading } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const showTestAccounts = params.get('test-creds') === '1';

  const { control, handleSubmit, setValue, formState } = useForm<LoginRequest>({
    resolver: zodResolver(LoginRequestSchema),
    defaultValues: { email: '', password: '' },
  });

  useEffect(() => {
    if (!isLoading && user) router.replace(homeFor(user));
  }, [isLoading, user, router]);

  const onSubmit = handleSubmit(async (values) => {
    setSubmitError(null);
    try {
      const signedIn = await login(values);
      router.replace(homeFor(signedIn));
    } catch (err) {
      setSubmitError(errorMessage(err));
    }
  });

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      <aside className="brand-wash relative hidden flex-col justify-between overflow-hidden p-12 lg:flex">
        <BrandMark />
        <div className="relative z-10 max-w-md">
          <h1 className="font-display text-[2.75rem] font-black leading-[1.1] text-brand-500">
            Every author question, answered with care.
          </h1>
          <p className="mt-5 text-[17px] leading-relaxed text-ink-muted">
            Track your books and royalties, raise a query in seconds, and hear back from the
            BookLeaf team — all in one place.
          </p>
        </div>
        <p className="relative z-10 text-xs text-ink-subtle">
          BookLeaf Publishing · India &amp; US
        </p>
        {/* Soft pink "clouds" and wave, after the bookleafpub.in hero. */}
        <div className="pointer-events-none absolute top-24 -right-10 h-24 w-56 rounded-full bg-brand-100 blur-sm" />
        <div className="pointer-events-none absolute top-36 right-32 h-14 w-32 rounded-full bg-brand-100/80 blur-sm" />
        <div className="pointer-events-none absolute -right-32 -bottom-40 h-[28rem] w-[28rem] rounded-full bg-brand-200/70" />
        <div className="pointer-events-none absolute -bottom-24 left-10 h-56 w-[36rem] rounded-[50%] bg-brand-100/80" />
      </aside>

      <main className="flex items-center justify-center px-4 py-12 sm:px-8">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          className="w-full max-w-sm"
        >
          <div className="mb-8 lg:hidden">
            <BrandMark />
          </div>
          <h2 className="page-title">Sign in</h2>
          <p className="mb-6 mt-1 text-ink-muted">Use the email registered with BookLeaf.</p>

          {params.get('expired') ? (
            <Alert
              className="mb-4"
              type="info"
              showIcon
              title="Your session ended. Please sign in again."
            />
          ) : null}
          {submitError ? (
            <Alert className="mb-4" type="error" showIcon title={submitError} />
          ) : null}

          <form onSubmit={onSubmit} noValidate>
            <Form layout="vertical" component={false} requiredMark={false}>
              <Controller
                name="email"
                control={control}
                render={({ field, fieldState }) => (
                  <Form.Item
                    htmlFor={field.name}
                    label="Email"
                    validateStatus={fieldState.error ? 'error' : ''}
                    help={fieldState.error?.message}
                  >
                    <Input
                      {...field}
                      id={field.name}
                      type="email"
                      autoComplete="email"
                      size="large"
                      placeholder="you@example.com"
                    />
                  </Form.Item>
                )}
              />
              <Controller
                name="password"
                control={control}
                render={({ field, fieldState }) => (
                  <Form.Item
                    htmlFor={field.name}
                    label="Password"
                    validateStatus={fieldState.error ? 'error' : ''}
                    help={fieldState.error?.message}
                  >
                    <Input.Password
                      {...field}
                      id={field.name}
                      autoComplete="current-password"
                      size="large"
                    />
                  </Form.Item>
                )}
              />
              <Button
                type="primary"
                htmlType="submit"
                size="large"
                block
                loading={formState.isSubmitting}
              >
                Sign in
              </Button>
            </Form>
          </form>

          {showTestAccounts ? (
            <div className="mt-8 rounded-lg border border-dashed border-line p-4">
              <p className="section-title mb-1">Test accounts</p>
              <p className="mb-2 text-xs text-ink-subtle">Click one to fill in the form.</p>
              <div className="flex flex-col gap-1">
                {TEST_ACCOUNTS.map((a) => (
                  <button
                    key={a.email}
                    type="button"
                    className="rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-brand-50"
                    onClick={() => {
                      setValue('email', a.email, { shouldValidate: true });
                      setValue('password', a.password, { shouldValidate: true });
                    }}
                  >
                    <span className="block font-medium text-brand-700">{a.label}</span>
                    <span className="block text-xs text-ink-muted">
                      {a.email} · {a.password}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </motion.div>
      </main>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
