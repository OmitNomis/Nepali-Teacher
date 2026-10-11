import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button, Field, TextInput } from "../components/ui";
import { client, unwrap } from "../lib/api";

export function Login() {
  const qc = useQueryClient();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const login = useMutation({
    mutationFn: () => unwrap(client.auth.login.$post({ json: { username, password } })),
    onSuccess: (r) => qc.setQueryData(["me"], r.user),
  });

  return (
    <div className="pt-safe pb-safe relative flex min-h-dvh flex-col overflow-hidden">
      {/* sky + Himalaya, echoing the app icon */}
      <div className="absolute inset-x-0 top-0 h-[46dvh] bg-gradient-to-b from-brand to-[color-mix(in_srgb,var(--brand)_70%,var(--indigo))]" />
      <div className="absolute top-[12dvh] right-[14%] size-20 rounded-full bg-[#ffe9c7] opacity-90" />
      <svg
        className="absolute inset-x-0 top-[calc(46dvh-118px)] h-[120px] w-full"
        viewBox="0 0 400 120"
        preserveAspectRatio="none"
        aria-hidden
      >
        <path d="M0 120 V70 L70 20 L110 55 L170 5 L240 70 L290 40 L340 75 L400 45 V120 Z" fill="var(--indigo)" />
        <path d="M0 120 V95 C80 75 160 90 220 100 C290 112 350 100 400 88 V120 Z" fill="var(--bg)" />
      </svg>

      <div className="relative flex flex-1 flex-col px-6 pb-10">
        <div className="pt-[8dvh] text-center text-white">
          <p lang="ne" className="text-6xl font-bold drop-shadow-sm">
            नमस्ते
          </p>
          <p className="mt-3 text-lg font-bold opacity-90">ネパール語を、耳から。</p>
        </div>

        <form
          className="animate-pop mx-auto mt-auto flex w-full max-w-sm flex-col gap-4 pt-10"
          onSubmit={(e) => {
            e.preventDefault();
            login.mutate();
          }}
        >
          <Field label="ユーザー名">
            {(id) => (
              <TextInput
                id={id}
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect="off"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            )}
          </Field>
          <Field label="パスワード">
            {(id) => (
              <TextInput
                id={id}
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            )}
          </Field>
          {login.error && (
            <p className="rounded-2xl bg-brand-soft px-4 py-3 text-sm font-bold text-brand">
              {login.error.message === "Wrong username or password"
                ? "ユーザー名かパスワードが違います"
                : login.error.message}
            </p>
          )}
          <Button size="lg" type="submit" loading={login.isPending} disabled={!username || !password}>
            ログイン
          </Button>
        </form>
      </div>
    </div>
  );
}
